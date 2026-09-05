import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Request, Response as ExpressResponse } from 'express';

import {
  runMiddleware,
  applyMiddlewareResult,
  discoverGlobalMiddleware,
  discoverRouteMiddlewares,
  clearMiddlewareCaches,
  buildNextRequest,
  patternToRegExp,
  shouldRunMiddleware,
} from '../../src/server/middleware-runner';

function makeTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vista-middleware-test-'));
}

function createMockExpressReq(overrides: Partial<Request> = {}): Request {
  const headers: Record<string, string> = {
    host: 'localhost:3000',
    ...(overrides.headers as Record<string, string> || {}),
  };

  return {
    method: 'GET',
    url: '/',
    path: '/',
    originalUrl: '/',
    headers,
    query: {},
    get(name: string) {
      return headers[name.toLowerCase()];
    },
    ...overrides,
  } as unknown as Request;
}

function createMockExpressRes(): ExpressResponse & {
  _status: number;
  _headers: Record<string, string>;
  _body: any;
  _redirectUrl: string | null;
  _ended: boolean;
} {
  const res: any = {
    _status: 200,
    _headers: {},
    _body: null,
    _redirectUrl: null,
    _ended: false,
    status(code: number) {
      res._status = code;
      return res;
    },
    setHeader(key: string, val: string) {
      res._headers[key.toLowerCase()] = String(val);
      return res;
    },
    getHeader(key: string) {
      return res._headers[key.toLowerCase()];
    },
    send(body: any) {
      res._body = body;
      res._ended = true;
      return res;
    },
    json(body: any) {
      res._body = JSON.stringify(body);
      res._ended = true;
      return res;
    },
    end() {
      res._ended = true;
      return res;
    },
    redirect(statusOrUrl: number | string, url?: string) {
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

test('patternToRegExp correctly matches path patterns and wildcards', () => {
  const re1 = patternToRegExp('/dashboard/:path*');
  assert.equal(re1.test('/dashboard'), true);
  assert.equal(re1.test('/dashboard/settings'), true);
  assert.equal(re1.test('/dashboard/settings/profile'), true);
  assert.equal(re1.test('/api/users'), false);

  const re2 = patternToRegExp('/api/:segment');
  assert.equal(re2.test('/api/users'), true);
  assert.equal(re2.test('/api/auth'), true);
  assert.equal(re2.test('/api/users/123'), false);

  const re3 = patternToRegExp('/users/*');
  assert.equal(re3.test('/users/abc'), true);
  assert.equal(re3.test('/users/abc/def'), true);
  assert.equal(re3.test('/other'), false);
});

test('discoverGlobalMiddleware finds root and src middleware files', () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    // 1. Initially no middleware
    assert.equal(discoverGlobalMiddleware(tmp, true), null);

    // 2. Add src/middleware.ts
    const srcDir = path.join(tmp, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const srcMiddleware = path.join(srcDir, 'middleware.ts');
    fs.writeFileSync(srcMiddleware, 'exports.middleware = () => {};');

    assert.equal(discoverGlobalMiddleware(tmp, true), srcMiddleware);

    // 3. Add root middleware.ts (root takes precedence over src)
    const rootMiddleware = path.join(tmp, 'middleware.ts');
    fs.writeFileSync(rootMiddleware, 'exports.middleware = () => {};');

    assert.equal(discoverGlobalMiddleware(tmp, true), rootMiddleware);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('discoverRouteMiddlewares resolves segment hierarchy in order', () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    const appDir = path.join(tmp, 'app');
    const apiDir = path.join(appDir, 'api');
    const usersDir = path.join(apiDir, 'users');
    const userDynamicDir = path.join(usersDir, '[id]');
    fs.mkdirSync(userDynamicDir, { recursive: true });

    // Global middleware
    fs.writeFileSync(path.join(tmp, 'middleware.ts'), 'exports.middleware = () => {};');

    // App-level middleware
    const appMiddleware = path.join(appDir, 'middleware.ts');
    fs.writeFileSync(appMiddleware, 'exports.middleware = () => {};');

    // Segment middleware in app/api
    const apiMiddleware = path.join(apiDir, 'middleware.ts');
    fs.writeFileSync(apiMiddleware, 'exports.middleware = () => {};');

    // Dynamic segment middleware in app/api/users/[id]
    const userMiddleware = path.join(userDynamicDir, 'middleware.ts');
    fs.writeFileSync(userMiddleware, 'exports.middleware = () => {};');

    // Route file with export in app/api/users/[id]/route.ts
    const routeFile = path.join(userDynamicDir, 'route.ts');
    fs.writeFileSync(routeFile, 'exports.middleware = () => {}; exports.GET = () => {};');

    const discovered = discoverRouteMiddlewares(tmp, '/api/users/42', true);

    assert.equal(discovered.length, 4);
    assert.equal(discovered[0], appMiddleware);
    assert.equal(discovered[1], apiMiddleware);
    assert.equal(discovered[2], userMiddleware);
    assert.equal(discovered[3], routeFile);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('global middleware runs with { request, next } and modifies response headers', async () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    const middlewareFile = path.join(tmp, 'middleware.ts');
    fs.writeFileSync(
      middlewareFile,
      `
      exports.middleware = async function middleware({ request, next }) {
        const res = await next();
        res.headers.set('x-custom-global', 'applied');
        res.headers.set('x-req-url', request.url);
        return res;
      };
      `
    );

    const req = createMockExpressReq({ url: '/about', path: '/about' });
    const res = createMockExpressRes();

    const result = await runMiddleware(req, tmp, true);
    assert.equal(result.kind, 'next');
    assert.equal(result.responseHeaders?.get('x-custom-global'), 'applied');

    const finalized = applyMiddlewareResult(result, req, res);
    assert.equal(finalized, false); // should continue to page handler
    assert.equal(res.getHeader('x-custom-global'), 'applied');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('middleware can modify request headers forwarded to downstream handlers', async () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    const middlewareFile = path.join(tmp, 'middleware.ts');
    fs.writeFileSync(
      middlewareFile,
      `
      exports.middleware = async function middleware({ request, next }) {
        return next({
          request: {
            headers: {
              'x-injected-user': 'alice',
            },
          },
        });
      };
      `
    );

    const req = createMockExpressReq({ url: '/api/profile', path: '/api/profile' });
    const res = createMockExpressRes();

    const result = await runMiddleware(req, tmp, true);
    assert.equal(result.kind, 'next');
    assert.equal(result.requestHeaders?.get('x-injected-user'), 'alice');

    const finalized = applyMiddlewareResult(result, req, res);
    assert.equal(finalized, false);
    // Verified that req.headers was updated
    assert.equal(req.headers['x-injected-user'], 'alice');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('middleware short-circuits request with custom status, body, and headers (rejection)', async () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    const middlewareFile = path.join(tmp, 'middleware.ts');
    fs.writeFileSync(
      middlewareFile,
      `
      exports.middleware = async function middleware({ request, next }) {
        if (request.nextUrl.pathname.startsWith('/admin')) {
          return new Response(JSON.stringify({ error: 'Unauthorized', code: 401 }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'X-Auth-Failed': 'true',
            },
          });
        }
        return next();
      };
      `
    );

    // Request to /admin should be rejected
    const reqAdmin = createMockExpressReq({ url: '/admin/settings', path: '/admin/settings' });
    const resAdmin = createMockExpressRes();

    const resultAdmin = await runMiddleware(reqAdmin, tmp, true);
    assert.equal(resultAdmin.kind, 'short-circuit');
    assert.equal(resultAdmin.status, 401);
    assert.equal(resultAdmin.responseHeaders?.get('x-auth-failed'), 'true');
    assert.equal(JSON.parse(resultAdmin.body as string).error, 'Unauthorized');

    const finalizedAdmin = applyMiddlewareResult(resultAdmin, reqAdmin, resAdmin);
    assert.equal(finalizedAdmin, true); // Short-circuited, stops execution
    assert.equal(resAdmin._status, 401);
    assert.equal(resAdmin.getHeader('x-auth-failed'), 'true');
    assert.equal(JSON.parse(resAdmin._body).error, 'Unauthorized');

    // Request to public route should continue
    const reqPublic = createMockExpressReq({ url: '/public/page', path: '/public/page' });
    const resPublic = createMockExpressRes();

    const resultPublic = await runMiddleware(reqPublic, tmp, true);
    assert.equal(resultPublic.kind, 'next');
    const finalizedPublic = applyMiddlewareResult(resultPublic, reqPublic, resPublic);
    assert.equal(finalizedPublic, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('middleware can redirect requests', async () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    const middlewareFile = path.join(tmp, 'middleware.ts');
    fs.writeFileSync(
      middlewareFile,
      `
      exports.middleware = async function middleware({ request }) {
        if (request.nextUrl.pathname === '/old-home') {
          return Response.redirect('https://example.com/new-home', 308);
        }
      };
      `
    );

    const req = createMockExpressReq({ url: '/old-home', path: '/old-home' });
    const res = createMockExpressRes();

    const result = await runMiddleware(req, tmp, true);
    assert.equal(result.kind, 'redirect');
    assert.equal(result.status, 308);
    assert.equal(result.location, 'https://example.com/new-home');

    const finalized = applyMiddlewareResult(result, req, res);
    assert.equal(finalized, true);
    assert.equal(res._status, 308);
    assert.equal(res._redirectUrl, 'https://example.com/new-home');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('execution order is strictly preserved: Global -> Segment -> Leaf Route', async () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    const orderLog: string[] = [];
    (global as any).__middleware_order_log = orderLog;

    // 1. Global middleware
    fs.writeFileSync(
      path.join(tmp, 'middleware.ts'),
      `
      exports.middleware = async function middleware({ request, next }) {
        global.__middleware_order_log.push('global:enter');
        const res = await next();
        global.__middleware_order_log.push('global:exit');
        return res;
      };
      `
    );

    // 2. Segment middleware in app/api
    const appDir = path.join(tmp, 'app');
    const apiDir = path.join(appDir, 'api');
    const usersDir = path.join(apiDir, 'users');
    fs.mkdirSync(usersDir, { recursive: true });

    fs.writeFileSync(
      path.join(apiDir, 'middleware.ts'),
      `
      exports.middleware = async function middleware({ request, next }) {
        global.__middleware_order_log.push('api-segment:enter');
        const res = await next();
        global.__middleware_order_log.push('api-segment:exit');
        return res;
      };
      `
    );

    // 3. Sub-segment middleware in app/api/users
    fs.writeFileSync(
      path.join(usersDir, 'middleware.ts'),
      `
      exports.middleware = async function middleware({ request, next }) {
        global.__middleware_order_log.push('users-segment:enter');
        const res = await next();
        global.__middleware_order_log.push('users-segment:exit');
        return res;
      };
      `
    );

    // 4. Route file with exported middleware in app/api/users/route.ts
    fs.writeFileSync(
      path.join(usersDir, 'route.ts'),
      `
      exports.middleware = async function middleware({ request, next }) {
        global.__middleware_order_log.push('route-leaf:enter');
        const res = await next();
        global.__middleware_order_log.push('route-leaf:exit');
        return res;
      };
      `
    );

    const req = createMockExpressReq({ url: '/api/users', path: '/api/users' });
    const result = await runMiddleware(req, tmp, true);

    assert.equal(result.kind, 'next');

    assert.deepEqual(orderLog, [
      'global:enter',
      'api-segment:enter',
      'users-segment:enter',
      'route-leaf:enter',
      'route-leaf:exit',
      'users-segment:exit',
      'api-segment:exit',
      'global:exit',
    ]);
  } finally {
    delete (global as any).__middleware_order_log;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('upstream middleware rejection prevents downstream route-specific middleware from running', async () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    const executed: string[] = [];
    (global as any).__executed_middlewares = executed;

    // Global middleware passes
    fs.writeFileSync(
      path.join(tmp, 'middleware.ts'),
      `
      exports.middleware = async function middleware({ next }) {
        global.__executed_middlewares.push('global');
        return next();
      };
      `
    );

    // App/admin segment middleware rejects
    const appDir = path.join(tmp, 'app');
    const adminDir = path.join(appDir, 'admin');
    fs.mkdirSync(adminDir, { recursive: true });

    fs.writeFileSync(
      path.join(adminDir, 'middleware.ts'),
      `
      exports.middleware = async function middleware() {
        global.__executed_middlewares.push('admin');
        return new Response('Forbidden', { status: 403 });
      };
      `
    );

    // app/admin/page.tsx exported middleware should NOT be reached
    fs.writeFileSync(
      path.join(adminDir, 'page.tsx'),
      `
      exports.middleware = async function middleware({ next }) {
        global.__executed_middlewares.push('page');
        return next();
      };
      `
    );

    const req = createMockExpressReq({ url: '/admin', path: '/admin' });
    const result = await runMiddleware(req, tmp, true);

    assert.equal(result.kind, 'short-circuit');
    assert.equal(result.status, 403);
    assert.equal(result.body, 'Forbidden');

    assert.deepEqual(executed, ['global', 'admin']);
    assert.equal(executed.includes('page'), false);
  } finally {
    delete (global as any).__executed_middlewares;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('config.matcher filtering is respected', async () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    fs.writeFileSync(
      path.join(tmp, 'middleware.ts'),
      `
      exports.config = {
        matcher: ['/dashboard/:path*', '/api/:path*'],
      };
      exports.middleware = async function middleware({ next }) {
        const res = await next();
        res.headers.set('x-matched', 'true');
        return res;
      };
      `
    );

    // Matching route: /dashboard/analytics
    const req1 = createMockExpressReq({ url: '/dashboard/analytics', path: '/dashboard/analytics' });
    const res1 = await runMiddleware(req1, tmp, true);
    assert.equal(res1.kind, 'next');
    assert.equal(res1.responseHeaders?.get('x-matched'), 'true');

    // Matching route: /api/users
    const req2 = createMockExpressReq({ url: '/api/users', path: '/api/users' });
    const res2 = await runMiddleware(req2, tmp, true);
    assert.equal(res2.kind, 'next');
    assert.equal(res2.responseHeaders?.get('x-matched'), 'true');

    // Non-matching route: /public/about
    const req3 = createMockExpressReq({ url: '/public/about', path: '/public/about' });
    const res3 = await runMiddleware(req3, tmp, true);
    assert.equal(res3.kind, 'skip');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('middleware intercepts both page routes and API routes', async () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    // Top-level middleware checking auth header
    fs.writeFileSync(
      path.join(tmp, 'middleware.ts'),
      `
      exports.middleware = async function middleware({ request, next }) {
        if (request.nextUrl.pathname.startsWith('/api/') && !request.headers.get('x-api-key')) {
          return new Response(JSON.stringify({ error: 'API key required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (request.nextUrl.pathname.startsWith('/dashboard') && !request.cookies.get('session')) {
          return Response.redirect('http://localhost:3000/login', 307);
        }
        const res = await next();
        res.headers.set('x-authenticated', 'true');
        return res;
      };
      `
    );

    // 1. Page route without session -> redirects to login
    const pageReqUnauth = createMockExpressReq({ url: '/dashboard', path: '/dashboard' });
    const pageResUnauth = createMockExpressRes();
    const pageResultUnauth = await runMiddleware(pageReqUnauth, tmp, true);
    assert.equal(pageResultUnauth.kind, 'redirect');
    assert.equal(pageResultUnauth.location, 'http://localhost:3000/login');
    assert.equal(applyMiddlewareResult(pageResultUnauth, pageReqUnauth, pageResUnauth), true);

    // 2. Page route with session -> passes
    const pageReqAuth = createMockExpressReq({
      url: '/dashboard',
      path: '/dashboard',
      headers: { cookie: 'session=secret123' },
    });
    const pageResAuth = createMockExpressRes();
    const pageResultAuth = await runMiddleware(pageReqAuth, tmp, true);
    assert.equal(pageResultAuth.kind, 'next');
    assert.equal(applyMiddlewareResult(pageResultAuth, pageReqAuth, pageResAuth), false);
    assert.equal(pageResAuth.getHeader('x-authenticated'), 'true');

    // 3. API route without api-key -> short-circuits with 401
    const apiReqUnauth = createMockExpressReq({ url: '/api/data', path: '/api/data' });
    const apiResUnauth = createMockExpressRes();
    const apiResultUnauth = await runMiddleware(apiReqUnauth, tmp, true);
    assert.equal(apiResultUnauth.kind, 'short-circuit');
    assert.equal(apiResultUnauth.status, 401);
    assert.equal(applyMiddlewareResult(apiResultUnauth, apiReqUnauth, apiResUnauth), true);
    assert.equal(apiResUnauth._status, 401);
    assert.equal(JSON.parse(apiResUnauth._body).error, 'API key required');

    // 4. API route with api-key -> passes
    const apiReqAuth = createMockExpressReq({
      url: '/api/data',
      path: '/api/data',
      headers: { 'x-api-key': 'valid-key' },
    });
    const apiResAuth = createMockExpressRes();
    const apiResultAuth = await runMiddleware(apiReqAuth, tmp, true);
    assert.equal(apiResultAuth.kind, 'next');
    assert.equal(applyMiddlewareResult(apiResultAuth, apiReqAuth, apiResAuth), false);
    assert.equal(apiResAuth.getHeader('x-authenticated'), 'true');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('supports export default as well as named export middleware in dedicated middleware files', async () => {
  clearMiddlewareCaches();
  const tmp = makeTempProject();

  try {
    fs.writeFileSync(
      path.join(tmp, 'middleware.ts'),
      `
      module.exports.default = async function({ next }) {
        const res = await next();
        res.headers.set('x-default-export', 'yes');
        return res;
      };
      `
    );

    const req = createMockExpressReq({ url: '/test', path: '/test' });
    const res = createMockExpressRes();
    const result = await runMiddleware(req, tmp, true);
    assert.equal(result.kind, 'next');
    assert.equal(result.responseHeaders?.get('x-default-export'), 'yes');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
