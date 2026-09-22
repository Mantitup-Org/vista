#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const vistaSrc = path.join(repoRoot, 'packages', 'vista', 'src');

function registerTypeScriptRuntime() {
  const searchRoots = [repoRoot, path.join(repoRoot, 'packages', 'vista')];
  const resolveFromWorkspace = (specifier) => {
    for (const root of searchRoots) {
      try {
        return require.resolve(specifier, { paths: [root] });
      } catch {}
    }
    throw new Error(`Unable to resolve ${specifier}`);
  };
  try {
    require(resolveFromWorkspace('@swc-node/register'));
    return;
  } catch {}
  try {
    require(resolveFromWorkspace('ts-node/register/transpile-only'));
    return;
  } catch {}
  throw new Error('No TypeScript runtime found.');
}

registerTypeScriptRuntime();

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-test-secret-test-secret-32';

const {
  VistaAuth,
  Credentials,
  hashPassword,
  verifyPassword,
} = require(path.join(vistaSrc, 'auth', 'index.ts'));

async function main() {
  assert.equal(verifyPassword('hunter2', hashPassword('hunter2')), true);
  assert.equal(verifyPassword('nope', hashPassword('hunter2')), false);

  const { handlers, auth } = VistaAuth({
    secret: process.env.AUTH_SECRET,
    providers: [
      Credentials({
        authorize: async (credentials) => {
          if (credentials.email === 'a@b.c' && credentials.password === 'secret') {
            return { id: '1', email: 'a@b.c', name: 'Ada' };
          }
          return null;
        },
      }),
    ],
  });

  const csrf = await handlers.GET(new Request('http://localhost/api/auth/csrf'));
  const csrfJson = await csrf.json();
  assert.ok(csrfJson.csrfToken);
  const csrfCookie = String(csrf.headers.get('set-cookie') || '').split(';')[0];

  const denied = await handlers.POST(
    new Request('http://localhost/api/auth/signin/credentials', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: csrfCookie,
        'x-csrf-token': 'wrong',
      },
      body: JSON.stringify({ email: 'a@b.c', password: 'secret' }),
    })
  );
  assert.equal(denied.status, 403);

  const signedIn = await handlers.POST(
    new Request('http://localhost/api/auth/signin/credentials', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: csrfCookie,
        'x-csrf-token': csrfJson.csrfToken,
      },
      body: JSON.stringify({ email: 'a@b.c', password: 'secret', callbackUrl: '/app' }),
    })
  );
  assert.equal(signedIn.status, 302);
  const sessionCookie = String(signedIn.headers.get('set-cookie') || '')
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith('vista.session-token='));
  assert.ok(sessionCookie, 'Expected a session cookie after credentials sign-in');

  const session = await handlers.GET(
    new Request('http://localhost/api/auth/session', {
      headers: { cookie: sessionCookie.split(';')[0] },
    })
  );
  const sessionJson = await session.json();
  assert.equal(sessionJson.user.email, 'a@b.c');

  const tampered = await handlers.GET(
    new Request('http://localhost/api/auth/session', {
      headers: { cookie: 'vista.session-token=not-a-real-token' },
    })
  );
  const tamperedJson = await tampered.json();
  assert.equal(tamperedJson.user, null);

  const fromAuthHelper = await auth(
    new Request('http://localhost/app', {
      headers: { cookie: sessionCookie.split(';')[0] },
    })
  );
  assert.equal(fromAuthHelper.user.email, 'a@b.c');

  assert.equal(signedIn.headers.get('location'), '/app');

  const signedOut = await handlers.POST(
    new Request('http://localhost/api/auth/signout', { method: 'POST' })
  );
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const productionAuth = VistaAuth({
    secret: process.env.AUTH_SECRET,
    providers: [
      Credentials({
        authorize: async () => ({ id: '1', email: 'a@b.c' }),
      }),
    ],
  });
  const productionCsrf = await productionAuth.handlers.GET(
    new Request('http://localhost/api/auth/csrf')
  );
  const productionSignOut = await productionAuth.handlers.POST(
    new Request('http://localhost/api/auth/signout', { method: 'POST' })
  );
  process.env.NODE_ENV = previousNodeEnv;
  const productionCookies = [
    ...(typeof productionSignOut.headers.getSetCookie === 'function'
      ? productionSignOut.headers.getSetCookie()
      : [String(productionSignOut.headers.get('set-cookie') || '')]),
  ].join('; ');
  assert.match(productionCookies, /vista\.session-token=/);
  assert.match(productionCookies, /Secure/);
  assert.match(productionCookies, /HttpOnly/);
  assert.equal(productionCsrf.status, 200);
  assert.equal(signedOut.status, 302);

  const { handlers: callbackHandlers } = VistaAuth({
    secret: process.env.AUTH_SECRET,
    providers: [
      Credentials({
        authorize: async () => ({ id: '1', email: 'a@b.c', name: 'Ada' }),
      }),
    ],
    callbacks: {
      jwt: async ({ token, user }) => ({
        ...token,
        user: { ...token.user, name: user?.name ? `${user.name} JWT` : 'JWT' },
      }),
      session: async ({ session }) => ({
        ...session,
        user: { ...session.user, email: 'session@vista.test' },
      }),
      redirect: async ({ url }) => (url === '/app' ? '/home' : url),
    },
  });
  const callbackCsrf = await callbackHandlers.GET(new Request('http://localhost/api/auth/csrf'));
  const callbackCsrfJson = await callbackCsrf.json();
  const callbackCsrfCookie = String(callbackCsrf.headers.get('set-cookie') || '').split(';')[0];
  const callbackSignIn = await callbackHandlers.POST(
    new Request('http://localhost/api/auth/signin/credentials', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: callbackCsrfCookie,
        'x-csrf-token': callbackCsrfJson.csrfToken,
      },
      body: JSON.stringify({ email: 'a@b.c', password: 'secret', callbackUrl: '/app' }),
    })
  );
  assert.equal(callbackSignIn.headers.get('location'), '/home');
  const callbackSessionCookie = String(callbackSignIn.headers.get('set-cookie') || '')
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith('vista.session-token='));
  const callbackSession = await callbackHandlers.GET(
    new Request('http://localhost/api/auth/session', {
      headers: { cookie: callbackSessionCookie.split(';')[0] },
    })
  );
  const callbackSessionJson = await callbackSession.json();
  assert.equal(callbackSessionJson.user.name, 'Ada JWT');
  assert.equal(callbackSessionJson.user.email, 'session@vista.test');

  const { GitHub } = require(path.join(vistaSrc, 'auth', 'index.ts'));
  const { handlers: oauthHandlers } = VistaAuth({
    secret: process.env.AUTH_SECRET,
    providers: [GitHub({ clientId: 'id', clientSecret: 'secret' })],
  });
  const oauthStart = await oauthHandlers.GET(
    new Request('http://localhost/api/auth/signin/github?callbackUrl=/dashboard')
  );
  assert.equal(oauthStart.status, 302);
  const oauthCookies = typeof oauthStart.headers.getSetCookie === 'function'
    ? oauthStart.headers.getSetCookie()
    : String(oauthStart.headers.get('set-cookie') || '').split(/,(?=\s*vista\.)/);
  const stateCookie = oauthCookies.find((part) => part.includes('vista.oauth-state='));
  const pkceCookie = oauthCookies.find((part) => part.includes('vista.oauth-pkce=') || part.includes('vista.pkce='));
  const callbackCookie = oauthCookies.find((part) => part.includes('vista.oauth-callback='));
  assert.ok(stateCookie && pkceCookie && callbackCookie, 'OAuth start must set state, pkce, and callback cookies');
  const stateValue = decodeURIComponent(stateCookie.split('=')[1].split(';')[0]);
  const pkceValue = decodeURIComponent(pkceCookie.split('=')[1].split(';')[0]);
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes('access_token') || href.includes('github.com/login/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: 'tok' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ id: 7, login: 'octocat', name: 'Octo' }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const oauthDone = await oauthHandlers.GET(
      new Request(`http://localhost/api/auth/callback/github?code=abc&state=${stateValue}`, {
        headers: {
          cookie: [
            `vista.oauth-state=${encodeURIComponent(stateValue)}`,
            `vista.pkce=${encodeURIComponent(pkceValue)}`,
            'vista.oauth-callback=%2Fdashboard',
          ].join('; '),
        },
      })
    );
    assert.equal(oauthDone.status, 302);
    assert.equal(oauthDone.headers.get('location'), '/dashboard');
  } finally {
    global.fetch = originalFetch;
  }

  const reactSource = fs.readFileSync(path.join(vistaSrc, 'auth', 'react.tsx'), 'utf8');
  assert.match(reactSource, /form\.method = 'POST'/);
  assert.match(reactSource, /\/csrf/);

  const { runGenerateCommand } = require(path.join(vistaSrc, 'bin', 'generate.ts'));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-g-auth-'));
  try {
    const exitCode = await runGenerateCommand(['auth'], { cwd, log() {} });
    assert.equal(exitCode, 0);
    const configSource = fs.readFileSync(path.join(cwd, 'auth.ts'), 'utf8');
    const routeSource = fs.readFileSync(
      path.join(cwd, 'app', 'api', 'auth', '[...vista]', 'route.ts'),
      'utf8'
    );
    assert.match(configSource, /from 'vista\/auth'/);
    assert.match(configSource, /pages: \{ signIn: '\/signin' \}/);
    assert.match(configSource, /jwt: async/);
    assert.match(routeSource, /export const \{ GET, POST \} = handlers/);
    const signInPage = fs.readFileSync(path.join(cwd, 'app', 'signin', 'page.tsx'), 'utf8');
    assert.match(signInPage, /signIn\('credentials'/);
    assert.match(signInPage, /callbackUrl: '\/account'/);
    const middlewareSource = fs.readFileSync(path.join(cwd, 'middleware.ts'), 'utf8');
    assert.match(middlewareSource, /export default authMiddleware/);
    assert.match(middlewareSource, /\/account/);
    const envExample = fs.readFileSync(path.join(cwd, '.env.example'), 'utf8');
    assert.match(envExample, /AUTH_SECRET=/);
    const providerSource = fs.readFileSync(
      path.join(cwd, 'components', 'auth-session-provider.tsx'),
      'utf8'
    );
    assert.match(providerSource, /SessionProvider/);

    const templateRoot = path.join(
      repoRoot,
      'packages',
      'create-vista-app',
      'template',
      'app',
      'root.tsx'
    );
    fs.mkdirSync(path.join(cwd, 'app'), { recursive: true });
    fs.copyFileSync(templateRoot, path.join(cwd, 'app', 'root.tsx'));
    const patchExit = await runGenerateCommand(['auth'], { cwd, log() {} });
    assert.equal(patchExit, 0);
    const patchedRoot = fs.readFileSync(path.join(cwd, 'app', 'root.tsx'), 'utf8');
    assert.match(patchedRoot, /AuthSessionProvider/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }

  // Verify src/app layout support and import path resolution
  const srcCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-g-auth-src-'));
  try {
    fs.mkdirSync(path.join(srcCwd, 'src', 'app'), { recursive: true });
    fs.mkdirSync(path.join(srcCwd, 'src', 'components'), { recursive: true });
    const srcExit = await runGenerateCommand(['auth'], { cwd: srcCwd, log() {} });
    assert.equal(srcExit, 0);

    assert.equal(fs.existsSync(path.join(srcCwd, 'src', 'auth.ts')), true, 'src/auth.ts should be created');
    assert.equal(fs.existsSync(path.join(srcCwd, 'src', 'middleware.ts')), true, 'src/middleware.ts should be created');
    assert.equal(
      fs.existsSync(path.join(srcCwd, 'src', 'components', 'auth-session-provider.tsx')),
      true,
      'src/components/auth-session-provider.tsx should be created'
    );

    const routeSource = fs.readFileSync(
      path.join(srcCwd, 'src', 'app', 'api', 'auth', '[...vista]', 'route.ts'),
      'utf8'
    );
    const routeImportMatch = routeSource.match(/from '([^']+)';/);
    assert.ok(routeImportMatch, 'Route handler should import auth');
    const resolvedRouteAuth = path.resolve(
      path.join(srcCwd, 'src', 'app', 'api', 'auth', '[...vista]'),
      routeImportMatch[1] + '.ts'
    );
    assert.equal(fs.existsSync(resolvedRouteAuth), true, 'Route auth import must resolve to an existing file');

    const accountSource = fs.readFileSync(path.join(srcCwd, 'src', 'app', 'account', 'page.tsx'), 'utf8');
    const accountImportMatch = accountSource.match(/from '([^']+)';/);
    assert.ok(accountImportMatch, 'Account page should import auth');
    const resolvedAccountAuth = path.resolve(
      path.join(srcCwd, 'src', 'app', 'account'),
      accountImportMatch[1] + '.ts'
    );
    assert.equal(fs.existsSync(resolvedAccountAuth), true, 'Account auth import must resolve to an existing file');

    // Test layout.tsx fallback patching in src/app layout
    const templateRoot = path.join(
      repoRoot,
      'packages',
      'create-vista-app',
      'template',
      'app',
      'root.tsx'
    );
    fs.copyFileSync(templateRoot, path.join(srcCwd, 'src', 'app', 'layout.tsx'));
    const patchLayoutExit = await runGenerateCommand(['auth'], { cwd: srcCwd, log() {} });
    assert.equal(patchLayoutExit, 0);
    const patchedLayout = fs.readFileSync(path.join(srcCwd, 'src', 'app', 'layout.tsx'), 'utf8');
    assert.match(patchedLayout, /AuthSessionProvider/);
  } finally {
    fs.rmSync(srcCwd, { recursive: true, force: true });
  }

  // Verify coexistence when auth.ts is at root in a src/app project
  const mixedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-g-auth-mixed-'));
  try {
    fs.mkdirSync(path.join(mixedCwd, 'src', 'app'), { recursive: true });
    fs.writeFileSync(path.join(mixedCwd, 'auth.ts'), '// preexisting root auth\nexport const handlers = {};\n');
    const mixedExit = await runGenerateCommand(['auth'], { cwd: mixedCwd, log() {} });
    assert.equal(mixedExit, 0);

    const routeSource = fs.readFileSync(
      path.join(mixedCwd, 'src', 'app', 'api', 'auth', '[...vista]', 'route.ts'),
      'utf8'
    );
    const routeImportMatch = routeSource.match(/from '([^']+)';/);
    assert.ok(routeImportMatch);
    assert.equal(
      routeImportMatch[1],
      '../../../../../auth',
      'Route handler must navigate 5 levels up to resolve root auth.ts in src/app layout'
    );
    const resolvedRouteAuth = path.resolve(
      path.join(mixedCwd, 'src', 'app', 'api', 'auth', '[...vista]'),
      routeImportMatch[1] + '.ts'
    );
    assert.equal(fs.existsSync(resolvedRouteAuth), true, 'Resolved route auth file must exist');
  } finally {
    fs.rmSync(mixedCwd, { recursive: true, force: true });
  }

  console.log('[test:auth] ALL PASSED');
}

main().catch((error) => {
  console.error('[test:auth] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
