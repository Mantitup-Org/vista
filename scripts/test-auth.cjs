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
