#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

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

  throw new Error('No TypeScript runtime found for middleware tests.');
}

registerTypeScriptRuntime();

const {
  runMiddleware,
  applyMiddlewareResult,
  discoverGlobalMiddleware,
  discoverRouteMiddlewares,
  clearMiddlewareCaches,
  patternToRegExp,
} = require(path.join(repoRoot, 'packages', 'vista', 'src', 'server', 'middleware-runner.ts'));

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vista-middleware-cjs-'));
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
    headers,
    query: {},
    get(name) {
      return headers[name.toLowerCase()];
    },
    ...overrides,
  };
}

function createMockRes() {
  const res = {
    _status: 200,
    _headers: {},
    _body: null,
    _redirectUrl: null,
    _ended: false,
    status(code) {
      res._status = code;
      return res;
    },
    setHeader(key, val) {
      res._headers[key.toLowerCase()] = String(val);
      return res;
    },
    getHeader(key) {
      return res._headers[key.toLowerCase()];
    },
    send(body) {
      res._body = body;
      res._ended = true;
      return res;
    },
    json(body) {
      res._body = JSON.stringify(body);
      res._ended = true;
      return res;
    },
    end() {
      res._ended = true;
      return res;
    },
    redirect(statusOrUrl, url) {
      if (typeof statusOrUrl === 'number') {
        res._status = statusOrUrl;
        res._redirectUrl = url || null;
      } else {
        res._status = 302;
        res._redirectUrl = statusOrUrl;
      }
      res._ended = true;
      return res;
    },
  };
  return res;
}

async function runTests() {
  console.log('\n━━━ Vista Built-in Middleware Verification ━━━\n');

  // Test 1: Pattern matcher
  console.log('[Suite 1] Pattern Matching');
  const re = patternToRegExp('/api/:path*');
  assert.equal(re.test('/api'), true);
  assert.equal(re.test('/api/users'), true);
  assert.equal(re.test('/api/users/123/settings'), true);
  assert.equal(re.test('/pages/home'), false);
  console.log('  ✓ Path matching with wildcards');

  // Test 2: Global middleware with { request, next }
  console.log('\n[Suite 2] Global Middleware');
  const tmp1 = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(tmp1, 'middleware.ts'),
      `
      exports.middleware = async function middleware({ request, next }) {
        const res = await next();
        res.headers.set('x-middleware-test', 'global-ok');
        return res;
      };
      `
    );

    const req = createMockReq({ url: '/about', path: '/about' });
    const res = createMockRes();
    const result = await runMiddleware(req, tmp1, true);
    assert.equal(result.kind, 'next');
    assert.equal(result.responseHeaders.get('x-middleware-test'), 'global-ok');

    const finalized = applyMiddlewareResult(result, req, res);
    assert.equal(finalized, false);
    assert.equal(res.getHeader('x-middleware-test'), 'global-ok');
    console.log('  ✓ Global middleware executes with { request, next }');
    console.log('  ✓ Modifies response headers and continues to handler');
  } finally {
    fs.rmSync(tmp1, { recursive: true, force: true });
  }

  // Test 3: Short-circuiting / Rejection
  console.log('\n[Suite 3] Request Rejection & Short-Circuit');
  const tmp2 = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(tmp2, 'middleware.ts'),
      `
      exports.middleware = async function middleware({ request, next }) {
        if (request.nextUrl.pathname === '/protected') {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return next();
      };
      `
    );

    const req = createMockReq({ url: '/protected', path: '/protected' });
    const res = createMockRes();
    const result = await runMiddleware(req, tmp2, true);
    assert.equal(result.kind, 'short-circuit');
    assert.equal(result.status, 401);

    const finalized = applyMiddlewareResult(result, req, res);
    assert.equal(finalized, true);
    assert.equal(res._status, 401);
    assert.equal(JSON.parse(res._body).error, 'Unauthorized');
    console.log('  ✓ Request rejection short-circuits with custom status and body');
    console.log('  ✓ applyMiddlewareResult finalizes response without calling route');
  } finally {
    fs.rmSync(tmp2, { recursive: true, force: true });
  }

  // Test 4: Execution order (Global -> Segment -> Leaf)
  console.log('\n[Suite 4] Middleware Execution Order');
  const tmp3 = makeTempProject();
  try {
    const trace = [];
    global.__test_middleware_trace = trace;

    fs.writeFileSync(
      path.join(tmp3, 'middleware.ts'),
      `
      exports.middleware = async function({ next }) {
        global.__test_middleware_trace.push('1:global:in');
        const res = await next();
        global.__test_middleware_trace.push('1:global:out');
        return res;
      };
      `
    );

    const appDir = path.join(tmp3, 'app');
    const adminDir = path.join(appDir, 'admin');
    fs.mkdirSync(adminDir, { recursive: true });

    fs.writeFileSync(
      path.join(adminDir, 'middleware.ts'),
      `
      exports.middleware = async function({ next }) {
        global.__test_middleware_trace.push('2:segment:in');
        const res = await next();
        global.__test_middleware_trace.push('2:segment:out');
        return res;
      };
      `
    );

    fs.writeFileSync(
      path.join(adminDir, 'page.tsx'),
      `
      exports.middleware = async function({ next }) {
        global.__test_middleware_trace.push('3:leaf:in');
        const res = await next();
        global.__test_middleware_trace.push('3:leaf:out');
        return res;
      };
      exports.default = function Page() {};
      `
    );

    const req = createMockReq({ url: '/admin', path: '/admin' });
    const result = await runMiddleware(req, tmp3, true);
    assert.equal(result.kind, 'next');

    assert.deepEqual(trace, [
      '1:global:in',
      '2:segment:in',
      '3:leaf:in',
      '3:leaf:out',
      '2:segment:out',
      '1:global:out',
    ]);
    console.log('  ✓ Multi-middleware order is verified: Global -> Segment -> Leaf Route');
    console.log('  ✓ Onion unwinding runs in reverse order');
  } finally {
    delete global.__test_middleware_trace;
    fs.rmSync(tmp3, { recursive: true, force: true });
  }

  // Test 5: Pages and API routes interception
  console.log('\n[Suite 5] Page Routes & API Routes Interception');
  const tmp4 = makeTempProject();
  try {
    fs.writeFileSync(
      path.join(tmp4, 'middleware.ts'),
      `
      exports.middleware = async function({ request, next }) {
        if (request.nextUrl.pathname.startsWith('/api/private')) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
        }
        if (request.nextUrl.pathname === '/secret-page') {
          return Response.redirect('http://localhost:3000/login', 307);
        }
        return next();
      };
      `
    );

    // API route interception
    const apiReq = createMockReq({ url: '/api/private/data', path: '/api/private/data' });
    const apiRes = createMockRes();
    const apiResult = await runMiddleware(apiReq, tmp4, true);
    assert.equal(apiResult.kind, 'short-circuit');
    assert.equal(apiResult.status, 403);
    assert.equal(applyMiddlewareResult(apiResult, apiReq, apiRes), true);
    console.log('  ✓ API route intercepted and rejected');

    // Page route interception
    const pageReq = createMockReq({ url: '/secret-page', path: '/secret-page' });
    const pageRes = createMockRes();
    const pageResult = await runMiddleware(pageReq, tmp4, true);
    assert.equal(pageResult.kind, 'redirect');
    assert.equal(pageResult.location, 'http://localhost:3000/login');
    assert.equal(applyMiddlewareResult(pageResult, pageReq, pageRes), true);
    console.log('  ✓ Page route intercepted and redirected');
  } finally {
    fs.rmSync(tmp4, { recursive: true, force: true });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[test:middleware] ALL PASSED ✓ — Built-in middleware system verified.\n');
}

runTests().catch((err) => {
  console.error('\n[test:middleware] FAILED ✗:', err);
  process.exit(1);
});
