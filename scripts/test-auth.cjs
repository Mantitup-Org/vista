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
    assert.match(routeSource, /export const \{ GET, POST \} = handlers/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }

  console.log('[test:auth] ALL PASSED');
}

main().catch((error) => {
  console.error('[test:auth] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
