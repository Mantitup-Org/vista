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

const { runMiddleware, applyMiddlewareResult } = require(
  path.join(vistaSrc, 'server', 'middleware-runner.ts')
);
const { isSafeRedirectLocation, sanitizeRequestHeaderMap } = require(
  path.join(vistaSrc, 'server', 'middleware-security.ts')
);

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vista-mw-sec-'));
}

function createMockReq(overrides = {}) {
  const headers = {
    host: 'localhost:3000',
    ...(overrides.headers || {}),
  };
  return {
    method: 'GET',
    url: '/',
    path: '/',
    originalUrl: '/',
    protocol: 'http',
    headers,
    query: {},
    get(name) {
      return headers[String(name).toLowerCase()];
    },
    ...overrides,
  };
}

function createMockRes() {
  const res = {
    _status: 200,
    _headers: {},
    _body: null,
    status(code) {
      res._status = code;
      return res;
    },
    setHeader(key, val) {
      res._headers[String(key).toLowerCase()] = String(val);
      return res;
    },
    send(body) {
      res._body = body;
      return res;
    },
    end() {
      return res;
    },
    redirect(status, location) {
      res._status = status;
      res._headers.location = location;
      return res;
    },
  };
  return res;
}

async function main() {
  assert.equal(isSafeRedirectLocation('/dashboard', 'http://localhost:3000/'), true);
  assert.equal(isSafeRedirectLocation('https://evil.example/phish', 'http://localhost:3000/'), false);
  assert.equal(
    isSafeRedirectLocation('https://trusted.example/ok', 'http://localhost:3000/', ['trusted.example']),
    true
  );
  assert.equal(isSafeRedirectLocation('/\\evil.example/phish', 'http://localhost:3000/'), false);

  const { isSafeRewriteLocation } = require(
    path.join(vistaSrc, 'server', 'middleware-security.ts')
  );
  assert.equal(isSafeRewriteLocation('/about'), true);
  assert.equal(isSafeRewriteLocation('/\\evil.example/phish'), false);
  assert.equal(isSafeRewriteLocation('//evil.example/phish'), false);

  const sanitized = sanitizeRequestHeaderMap({ Host: 'evil', 'x-user-id': '42', cookie: 'a=b' });
  assert.equal(sanitized.has('host'), false);
  assert.equal(sanitized.has('cookie'), false);
  assert.equal(sanitized.get('x-user-id'), '42');

  const tmp = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(tmp, 'middleware.ts'),
      `
      exports.config = { allowedRedirectHosts: [] };
      exports.middleware = async function() {
        return Response.redirect('https://evil.example/phish', 307);
      };
      `
    );
    const req = createMockReq({ url: '/', path: '/' });
    const result = await runMiddleware(req, tmp, true);
    assert.equal(result.kind, 'short-circuit');
    assert.equal(result.status, 400);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const tmpLoad = makeTempProject();
  try {
    fs.writeFileSync(path.join(tmpLoad, 'middleware.ts'), 'throw new Error("boom");');
    const req = createMockReq({ url: '/', path: '/' });
    const result = await runMiddleware(req, tmpLoad, true);
    assert.equal(result.kind, 'short-circuit');
    assert.equal(result.status, 500);
  } finally {
    fs.rmSync(tmpLoad, { recursive: true, force: true });
  }

  const tmpEmpty = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(tmpEmpty, 'middleware.ts'),
      'exports.config = { matcher: "/admin" };\n'
    );
    const req = createMockReq({ url: '/admin', path: '/admin' });
    const result = await runMiddleware(req, tmpEmpty, true);
    assert.equal(result.kind, 'short-circuit');
    assert.equal(result.status, 500);
  } finally {
    fs.rmSync(tmpEmpty, { recursive: true, force: true });
  }

  const tmp2 = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(tmp2, 'middleware.ts'),
      `
      exports.middleware = async function({ next }) {
        return next({ request: { headers: { host: 'evil', 'x-user-id': '7' } } });
      };
      `
    );
    const req = createMockReq({ url: '/', path: '/' });
    const result = await runMiddleware(req, tmp2, true);
    assert.equal(result.kind, 'next');
    assert.equal(result.requestHeaders.get('host'), undefined);
    assert.equal(result.requestHeaders.get('x-user-id'), '7');
    const res = createMockRes();
    applyMiddlewareResult(result, req, res);
    assert.equal(req.headers.host, 'localhost:3000');
    assert.equal(req.headers['x-user-id'], '7');
  } finally {
    fs.rmSync(tmp2, { recursive: true, force: true });
  }

  const { cors, chain } = require(
    path.join(vistaSrc, 'server', 'middleware-security.ts')
  );

  // Test Issue #137: cors wildcard with credentials
  const corsHandler = cors({ origin: '*', credentials: true });
  const corsReqWithOrigin = new Request('http://localhost:3000/api/data', {
    headers: { origin: 'https://app.example.com' },
  });
  const corsHeaders1 = corsHandler(corsReqWithOrigin);
  assert.equal(corsHeaders1.get('Access-Control-Allow-Origin'), 'https://app.example.com');
  assert.equal(corsHeaders1.get('Access-Control-Allow-Credentials'), 'true');
  assert.equal(corsHeaders1.get('Vary'), 'Origin');

  const corsReqNoOrigin = new Request('http://localhost:3000/api/data');
  const corsHeaders2 = corsHandler(corsReqNoOrigin);
  assert.equal(corsHeaders2.get('Access-Control-Allow-Origin'), null);
  assert.equal(corsHeaders2.get('Access-Control-Allow-Credentials'), 'true');

  const corsStandardWildcard = cors({ origin: '*', credentials: false });
  const corsHeaders3 = corsStandardWildcard(corsReqWithOrigin);
  assert.equal(corsHeaders3.get('Access-Control-Allow-Origin'), '*');
  assert.equal(corsHeaders3.get('Access-Control-Allow-Credentials'), null);

  // Test Issue #139: chain() with onion pattern (await ctx.next() without returning)
  let mw1Before = false;
  let mw1After = false;
  let mw2Executed = false;
  const chained = chain([
    async (ctx) => {
      mw1Before = true;
      await ctx.next();
      mw1After = true;
      // does not return ctx.next() result, returns undefined
    },
    async () => {
      mw2Executed = true;
      return new Response('from mw2');
    },
  ]);
  const chainRes = await chained({ request: new Request('http://localhost:3000/') });
  assert.equal(mw1Before, true);
  assert.equal(mw2Executed, true);
  assert.equal(mw1After, true);
  assert.equal(chainRes instanceof Response, true);
  assert.equal(await chainRes.text(), 'from mw2');

  console.log('[test:middleware-security] ALL PASSED');
}

main().catch((error) => {
  console.error('[test:middleware-security] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
