import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';

import {
  resolveRouteHandler,
  runRouteHandler,
  createParamsContext,
} from '../../src/server/typed-api-runtime';

function makeTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vista-route-handler-test-'));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

async function withRouteServer(
  cwd: string,
  run: (origin: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(express.json());

  app.use(async (req, res) => {
    const resolved = resolveRouteHandler(cwd, req.path);
    if (resolved) {
      await runRouteHandler({
        req,
        res,
        apiPath: resolved.filePath,
        isDev: true,
        params: resolved.params,
      });
      return;
    }

    res.status(404).json({ error: 'Not Found' });
  });

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await run('http://127.0.0.1:' + port);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('createParamsContext supports both sync and async access', async () => {
  const rawParams = { id: 'user-123', tag: 'admin' };
  const paramsContext = createParamsContext(rawParams);

  // Sync access (Next.js 14 style)
  assert.equal(paramsContext.id, 'user-123');
  assert.equal(paramsContext.tag, 'admin');

  // Async access (Next.js 15+ style)
  const awaited = await paramsContext;
  assert.equal(awaited.id, 'user-123');
  assert.equal(awaited.tag, 'admin');
});

test('HTTP methods (GET, POST, PUT, PATCH, DELETE) dispatching and body parsing', async () => {
  const cwd = makeTempProject();
  try {
    const routeFile = path.join(cwd, 'app', 'api', 'items', 'route.ts');
    writeFile(
      routeFile,
      [
        'exports.GET = async function GET(request) {',
        '  return Response.json({ method: "GET", url: request.nextUrl.pathname });',
        '};',
        'exports.POST = async function POST(request) {',
        '  const body = await request.json();',
        '  return Response.json({ method: "POST", received: body }, { status: 201 });',
        '};',
        'exports.PUT = async function PUT(request) {',
        '  const body = await request.json();',
        '  return Response.json({ method: "PUT", updated: body });',
        '};',
        'exports.PATCH = async function PATCH(request) {',
        '  const body = await request.json();',
        '  return Response.json({ method: "PATCH", patched: body });',
        '};',
        'exports.DELETE = async function DELETE() {',
        '  return Response.json({ method: "DELETE", success: true });',
        '};',
      ].join('\n')
    );

    await withRouteServer(cwd, async (origin) => {
      // GET
      const getRes = await fetch(origin + '/api/items');
      assert.equal(getRes.status, 200);
      assert.deepEqual(await getRes.json(), { method: 'GET', url: '/api/items' });

      // POST
      const postRes = await fetch(origin + '/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Gadget', price: 99 }),
      });
      assert.equal(postRes.status, 201);
      assert.deepEqual(await postRes.json(), {
        method: 'POST',
        received: { name: 'Gadget', price: 99 },
      });

      // PUT
      const putRes = await fetch(origin + '/api/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Gadget Pro' }),
      });
      assert.equal(putRes.status, 200);
      assert.deepEqual(await putRes.json(), {
        method: 'PUT',
        updated: { name: 'Gadget Pro' },
      });

      // PATCH
      const patchRes = await fetch(origin + '/api/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: 79 }),
      });
      assert.equal(patchRes.status, 200);
      assert.deepEqual(await patchRes.json(), {
        method: 'PATCH',
        patched: { price: 79 },
      });

      // DELETE
      const deleteRes = await fetch(origin + '/api/items', { method: 'DELETE' });
      assert.equal(deleteRes.status, 200);
      assert.deepEqual(await deleteRes.json(), { method: 'DELETE', success: true });
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('auto-OPTIONS responds with 204 and Allow header', async () => {
  const cwd = makeTempProject();
  try {
    const routeFile = path.join(cwd, 'app', 'api', 'readonly', 'route.ts');
    writeFile(
      routeFile,
      [
        'exports.GET = async function GET() {',
        '  return Response.json({ ok: true });',
        '};',
      ].join('\n')
    );

    await withRouteServer(cwd, async (origin) => {
      const res = await fetch(origin + '/api/readonly', { method: 'OPTIONS' });
      assert.equal(res.status, 204);
      const allow = res.headers.get('allow');
      assert(allow, 'Expected Allow header');
      assert(allow.includes('GET'));
      assert(allow.includes('HEAD'));
      assert(allow.includes('OPTIONS'));
      assert.equal(await res.text(), '');
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('auto-HEAD fallback executes GET without returning a body', async () => {
  const cwd = makeTempProject();
  try {
    const routeFile = path.join(cwd, 'app', 'api', 'resource', 'route.ts');
    writeFile(
      routeFile,
      [
        'exports.GET = async function GET() {',
        '  return Response.json(',
        '    { secret: "data" },',
        '    {',
        '      status: 200,',
        '      headers: { "X-Custom-Header": "Vista-Route" },',
        '    }',
        '  );',
        '};',
      ].join('\n')
    );

    await withRouteServer(cwd, async (origin) => {
      const res = await fetch(origin + '/api/resource', { method: 'HEAD' });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-custom-header'), 'Vista-Route');
      const body = await res.text();
      assert.equal(body, '');
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('unsupported method returns 405 Method Not Allowed with Allow header', async () => {
  const cwd = makeTempProject();
  try {
    const routeFile = path.join(cwd, 'app', 'api', 'users', 'route.ts');
    writeFile(
      routeFile,
      [
        'exports.GET = async function GET() {',
        '  return Response.json([]);',
        '};',
        'exports.POST = async function POST() {',
        '  return Response.json({ created: true });',
        '};',
      ].join('\n')
    );

    await withRouteServer(cwd, async (origin) => {
      const res = await fetch(origin + '/api/users', { method: 'DELETE' });
      assert.equal(res.status, 405);
      const allow = res.headers.get('allow');
      assert(allow, 'Expected Allow header');
      assert(allow.includes('GET'));
      assert(allow.includes('POST'));
      assert(allow.includes('HEAD'));
      assert(allow.includes('OPTIONS'));
      const json = await res.json();
      assert.equal(json.error, 'Method DELETE Not Allowed');
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('dynamic route segments [id] with sync and async params access', async () => {
  const cwd = makeTempProject();
  try {
    const routeFile = path.join(cwd, 'app', 'api', 'users', '[id]', 'route.ts');
    writeFile(
      routeFile,
      [
        'exports.GET = async function GET(request, context) {',
        '  const syncId = context.params.id;',
        '  const asyncParams = await context.params;',
        '  return Response.json({',
        '    syncId,',
        '    asyncId: asyncParams.id,',
        '  });',
        '};',
      ].join('\n')
    );

    await withRouteServer(cwd, async (origin) => {
      const res = await fetch(origin + '/api/users/user_42');
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        syncId: 'user_42',
        asyncId: 'user_42',
      });

      // Encoded param check
      const encodedRes = await fetch(origin + '/api/users/%E2%9C%A8');
      assert.equal(encodedRes.status, 200);
      assert.deepEqual(await encodedRes.json(), {
        syncId: '✨',
        asyncId: '✨',
      });
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('catch-all routes [...slug] and optional catch-all [[...slug]]', async () => {
  const cwd = makeTempProject();
  try {
    const catchAllFile = path.join(cwd, 'app', 'api', 'posts', '[...slug]', 'route.ts');
    writeFile(
      catchAllFile,
      [
        'exports.GET = async function GET(request, context) {',
        '  const { slug } = await context.params;',
        '  return Response.json({ slug });',
        '};',
      ].join('\n')
    );

    const optionalCatchAllFile = path.join(cwd, 'app', 'api', 'docs', '[[...slug]]', 'route.ts');
    writeFile(
      optionalCatchAllFile,
      [
        'exports.GET = async function GET(request, context) {',
        '  const { slug } = await context.params;',
        '  return Response.json({ slug: slug ?? null });',
        '};',
      ].join('\n')
    );

    await withRouteServer(cwd, async (origin) => {
      // Catch-all with multiple segments
      const postsRes = await fetch(origin + '/api/posts/2026/09/hello-world');
      assert.equal(postsRes.status, 200);
      assert.deepEqual(await postsRes.json(), { slug: ['2026', '09', 'hello-world'] });

      // Optional catch-all with zero extra segments
      const docsRootRes = await fetch(origin + '/api/docs');
      assert.equal(docsRootRes.status, 200);
      assert.deepEqual(await docsRootRes.json(), { slug: null });

      // Optional catch-all with 1 segment
      const docsSubRes = await fetch(origin + '/api/docs/getting-started');
      assert.equal(docsSubRes.status, 200);
      assert.deepEqual(await docsSubRes.json(), { slug: ['getting-started'] });
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('route groups (group) are omitted from URL and route specificity ranking works', async () => {
  const cwd = makeTempProject();
  try {
    // Route group (marketing)
    const marketingFile = path.join(cwd, 'app', '(marketing)', 'about', 'route.ts');
    writeFile(
      marketingFile,
      [
        'exports.GET = async function GET() {',
        '  return Response.json({ source: "marketing-about" });',
        '};',
      ].join('\n')
    );

    // Specific route /api/users/me vs dynamic /api/users/[id]
    const meFile = path.join(cwd, 'app', 'api', 'users', 'me', 'route.ts');
    writeFile(
      meFile,
      [
        'exports.GET = async function GET() {',
        '  return Response.json({ user: "me-endpoint" });',
        '};',
      ].join('\n')
    );

    const dynamicUserFile = path.join(cwd, 'app', 'api', 'users', '[id]', 'route.ts');
    writeFile(
      dynamicUserFile,
      [
        'exports.GET = async function GET(request, context) {',
        '  return Response.json({ user: context.params.id });',
        '};',
      ].join('\n')
    );

    await withRouteServer(cwd, async (origin) => {
      // Route group
      const aboutRes = await fetch(origin + '/about');
      assert.equal(aboutRes.status, 200);
      assert.deepEqual(await aboutRes.json(), { source: 'marketing-about' });

      // Specific /api/users/me matches me/route.ts
      const meRes = await fetch(origin + '/api/users/me');
      assert.equal(meRes.status, 200);
      assert.deepEqual(await meRes.json(), { user: 'me-endpoint' });

      // Other /api/users/42 matches [id]/route.ts
      const otherRes = await fetch(origin + '/api/users/42');
      assert.equal(otherRes.status, 200);
      assert.deepEqual(await otherRes.json(), { user: '42' });
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('request.cookies and multi-cookie Set-Cookie response support', async () => {
  const cwd = makeTempProject();
  try {
    const routeFile = path.join(cwd, 'app', 'api', 'auth', 'route.ts');
    writeFile(
      routeFile,
      [
        'exports.GET = async function GET(request) {',
        '  const session = request.cookies.get("session_id")?.value;',
        '  const response = Response.json({ authenticated: session === "valid_token" });',
        '  response.headers.append("Set-Cookie", "session_id=refreshed_token; Path=/; HttpOnly");',
        '  response.headers.append("Set-Cookie", "theme=dark; Path=/");',
        '  return response;',
        '};',
      ].join('\n')
    );

    await withRouteServer(cwd, async (origin) => {
      const res = await fetch(origin + '/api/auth', {
        headers: { Cookie: 'session_id=valid_token' },
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { authenticated: true });

      const setCookies = res.headers.getSetCookie();
      assert(Array.isArray(setCookies) && setCookies.length >= 2, 'Expected multiple Set-Cookie headers');
      assert(setCookies.some((c) => c.includes('session_id=refreshed_token')));
      assert(setCookies.some((c) => c.includes('theme=dark')));
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
