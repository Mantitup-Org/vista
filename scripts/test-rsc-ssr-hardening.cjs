#!/usr/bin/env node

/**
 * Guards the RSC/SSR/CLI hardening fixes:
 *  - `'use client'` files outside app/ enter the client manifest
 *  - vista/theme (and other client subpaths) expose a react-server export
 *  - NextResponse.next({ request: { headers } }) forwards request headers
 *  - route.ts bodies are size-limited and malformed cookies do not 500
 *  - route.ts streaming Responses are piped instead of fully buffered
 *  - stack procedures that return Response keep their status
 *  - `vista g agent` imports vista/ai
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Writable } = require('node:stream');

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

  throw new Error('No TypeScript runtime found for RSC/SSR hardening tests.');
}

registerTypeScriptRuntime();

const { generateClientManifest, generateClientManifestWithRoots, discoverProjectClientRoots } = require(
  path.join(vistaSrc, 'build', 'rsc', 'client-manifest.ts')
);
const { createGuardedReactClientManifest } = require(
  path.join(vistaSrc, 'build', 'rsc', 'react-client-reference-manifest.ts')
);
const { NextResponse } = require(path.join(vistaSrc, 'server', 'index.ts'));
const { runMiddleware, applyMiddlewareResult } = require(
  path.join(vistaSrc, 'server', 'middleware-runner.ts')
);
const typedApiRuntime = require(path.join(vistaSrc, 'server', 'typed-api-runtime.ts'));
const { vstack } = require(path.join(vistaSrc, 'stack', 'index.ts'));
const { executeRoute } = require(path.join(vistaSrc, 'stack', 'server', 'executor.ts'));
const { safeDecodeURIComponent } = require(path.join(vistaSrc, 'server', 'cookie-parse.ts'));

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
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
      res._headers[key.toLowerCase()] = String(val);
      return res;
    },
    getHeader(key) {
      return res._headers[String(key).toLowerCase()];
    },
    json(payload) {
      res._body = JSON.stringify(payload);
      return res;
    },
    send(payload) {
      res._body = payload;
      return res;
    },
    end(payload) {
      if (payload !== undefined) res._body = payload;
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

function createRequest({ method = 'GET', url = '/', body, headers = {} }) {
  const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const request = {
    method,
    url,
    originalUrl: url,
    path: url.split('?')[0],
    protocol: 'http',
    headers: {
      host: 'localhost',
      ...(payload
        ? { 'content-type': 'application/json', 'content-length': String(payload.length) }
        : {}),
      ...headers,
    },
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
    async *[Symbol.asyncIterator]() {
      if (payload) yield payload;
    },
  };
  return request;
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    json(payload) {
      this.body = JSON.stringify(payload);
      return this;
    },
    send(payload) {
      this.body = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload ?? '');
      return this;
    },
    write(chunk) {
      this.body += chunk;
      return true;
    },
    end(chunk) {
      if (chunk) this.body += chunk;
      return this;
    },
  };
}

function createPipeResponse() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  res.statusCode = 200;
  res.headers = {};
  res.chunks = chunks;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (name, value) => {
    res.headers[String(name).toLowerCase()] = value;
    return res;
  };
  res.getHeader = (name) => res.headers[String(name).toLowerCase()];
  return res;
}

async function callRoute(projectDir, method, requestPath, { body, headers, response } = {}) {
  const match = typedApiRuntime.resolveRouteHandlerMatch(projectDir, requestPath);
  assert.ok(match, `Expected a route handler match for ${method} ${requestPath}`);
  const res = response || createResponse();
  const req = createRequest({ method, url: requestPath, body, headers });
  res.req = req;
  await typedApiRuntime.runLegacyApiRoute({
    req,
    res,
    apiPath: match.filePath,
    isDev: true,
    params: match.params,
  });
  return { res, match };
}

function checkClientManifestScansUtils() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-client-scan-'));
  try {
    writeFile(
      path.join(projectDir, 'app', 'page.tsx'),
      "export default function Page() { return null }\n"
    );
    writeFile(
      path.join(projectDir, 'utils', 'theme-toggle.tsx'),
      ["'use client'", '', 'export function ThemeToggle() { return null }', ''].join('\n')
    );
    writeFile(
      path.join(projectDir, 'lib', 'widget.tsx'),
      ["'use client'", '', 'export function Widget() { return null }', ''].join('\n')
    );

    const roots = discoverProjectClientRoots(projectDir);
    assert.ok(
      roots.some((root) => root.prefix === 'utils/'),
      'Expected utils/ to be a client-scan root'
    );
    assert.ok(
      roots.some((root) => root.prefix === 'lib/'),
      'Expected lib/ to be a client-scan root'
    );

    const manifest = generateClientManifest(projectDir, path.join(projectDir, 'app'));
    const modulePaths = Object.values(manifest.clientModules || {}).map((entry) =>
      String(entry.path || '')
    );
    assert.ok(
      modulePaths.some((modulePath) => modulePath.includes('theme-toggle')),
      `Expected utils/theme-toggle to enter the client manifest, got: ${modulePaths.join(', ')}`
    );
    assert.ok(
      modulePaths.some((modulePath) => modulePath.includes('widget')),
      `Expected lib/widget to enter the client manifest, got: ${modulePaths.join(', ')}`
    );
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }

  const srcAppDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-src-app-manifest-'));
  try {
    writeFile(
      path.join(srcAppDir, 'src', 'app', 'button.tsx'),
      ["'use client'", '', 'export default function Button() { return null }', ''].join('\n')
    );
    writeFile(
      path.join(srcAppDir, 'src', 'components', 'toggle.tsx'),
      ["'use client'", '', 'export function Toggle() { return null }', ''].join('\n')
    );
    const srcManifest = generateClientManifest(srcAppDir, path.join(srcAppDir, 'src', 'app'));
    const srcPaths = Object.values(srcManifest.clientModules || {}).map((entry) =>
      String(entry.path || '')
    );
    const buttonHits = srcPaths.filter((modulePath) => modulePath.includes('button'));
    assert.equal(
      buttonHits.length,
      1,
      `src/app/button must appear once, got: ${srcPaths.join(', ')}`
    );
    assert.ok(
      srcPaths.some((modulePath) => modulePath.includes('toggle')),
      `Expected src/components/toggle in the client manifest, got: ${srcPaths.join(', ')}`
    );
  } finally {
    fs.rmSync(srcAppDir, { recursive: true, force: true });
  }

  const customRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-custom-roots-'));
  try {
    writeFile(
      path.join(customRootDir, 'app', 'page.tsx'),
      'export default function Page() { return null }\n'
    );
    writeFile(
      path.join(customRootDir, '.hidden-clients', 'secret.tsx'),
      ["'use client'", '', 'export function Secret() { return null }', ''].join('\n')
    );
    const customManifest = generateClientManifestWithRoots(
      customRootDir,
      path.join(customRootDir, 'app'),
      [{ dir: path.join(customRootDir, '.hidden-clients'), prefix: 'hidden/' }]
    );
    const customPaths = Object.values(customManifest.clientModules || {}).map((entry) =>
      String(entry.path || '')
    );
    assert.ok(
      customPaths.some((modulePath) => modulePath.includes('secret')),
      `Custom additionalRoots must still be scanned, got: ${customPaths.join(', ')}`
    );
  } finally {
    fs.rmSync(customRootDir, { recursive: true, force: true });
  }
}

function checkReactServerExports() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'packages', 'vista', 'package.json'), 'utf8')
  );
  const required = [
    './theme',
    './link',
    './router',
    './navigation',
    './dynamic',
    './script',
    './ai/react',
    './auth/react',
    './client/rsc-router',
  ];
  for (const subpath of required) {
    assert.ok(
      packageJson.exports[subpath] && packageJson.exports[subpath]['react-server'],
      `Expected ${subpath} to declare a react-server export condition`
    );
  }

  assert.ok(
    fs.existsSync(path.join(vistaSrc, 'theme', 'react-server.ts')),
    'Expected packages/vista/src/theme/react-server.ts'
  );

  const generateSource = fs.readFileSync(path.join(vistaSrc, 'bin', 'generate.ts'), 'utf8');
  assert.ok(
    generateSource.includes("from 'vista/ai'"),
    'vista g agent must import from vista/ai, not @vistagenic/vista/ai'
  );
  assert.ok(
    !generateSource.includes('@vistagenic/vista/ai'),
    'vista g agent must not import @vistagenic/vista/ai'
  );
}

function checkGuardedManifest() {
  const guarded = createGuardedReactClientManifest({});
  assert.throws(
    () => guarded['file:///tmp/utils/theme-toggle.tsx#ThemeToggle'],
    /scanned project directory/
  );
}

function checkCookieDecode() {
  assert.equal(safeDecodeURIComponent('%E0%A4%A'), '%E0%A4%A');
  assert.equal(safeDecodeURIComponent('hello%20world'), 'hello world');
}

async function checkNextResponseHeaders() {
  const encoded = NextResponse.next({
    request: { headers: { 'x-user-id': '42' } },
  });
  assert.equal(encoded.headers.get('x-middleware-next'), '1');
  assert.equal(encoded.headers.get('x-middleware-request-x-user-id'), '42');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-mw-headers-'));
  try {
    writeFile(
      path.join(tmp, 'middleware.ts'),
      [
        'exports.middleware = async function () {',
        "  return new Response(null, {",
        '    status: 200,',
        '    headers: {',
        "      'x-middleware-next': '1',",
        "      'x-middleware-request-x-user-id': '42',",
        '    },',
        '  });',
        '};',
        '',
      ].join('\n')
    );

    const req = createMockReq({ url: '/', path: '/' });
    const result = await runMiddleware(req, tmp, true);
    assert.equal(result.kind, 'next');
    assert.equal(result.requestHeaders.get('x-user-id'), '42');

    const res = createMockRes();
    assert.equal(applyMiddlewareResult(result, req, res), false);
    assert.equal(req.headers['x-user-id'], '42');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function checkRouteBodyLimitAndCookies() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-route-hardening-'));
  try {
    writeFile(
      path.join(projectDir, 'app', 'api', 'echo', 'route.js'),
      [
        'export async function POST(request) {',
        '  const cookie = request.cookies.get("session");',
        '  const text = await request.text();',
        '  return Response.json({ cookie: cookie && cookie.value, size: text.length });',
        '}',
        '',
      ].join('\n')
    );
    writeFile(
      path.join(projectDir, 'app', 'api', 'stream', 'route.js'),
      [
        'export async function GET() {',
        '  const encoder = new TextEncoder();',
        '  const stream = new ReadableStream({',
        '    start(controller) {',
        "      controller.enqueue(encoder.encode('hello'));",
        "      controller.enqueue(encoder.encode('-stream'));",
        '      controller.close();',
        '    },',
        '  });',
        "  return new Response(stream, { headers: { 'content-type': 'text/plain' } });",
        '}',
        '',
      ].join('\n')
    );

    const oversized = await callRoute(projectDir, 'POST', '/api/echo', {
      body: Buffer.alloc(1024 * 1024 + 8, 97),
    });
    assert.equal(oversized.res.statusCode, 413, 'Expected oversized POST bodies to return 413');

    const cookie = await callRoute(projectDir, 'POST', '/api/echo', {
      body: { ok: true },
      headers: { cookie: 'session=%E0%A4%A; other=ok' },
    });
    assert.equal(cookie.res.statusCode, 200, 'Malformed cookie percent-encoding must not 500');

    const streamed = await callRoute(projectDir, 'GET', '/api/stream', {
      response: createPipeResponse(),
    });
    assert.equal(streamed.res.statusCode, 200);
    const streamedBody = Buffer.concat(streamed.res.chunks).toString('utf8');
    assert.equal(streamedBody, 'hello-stream');
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

async function checkStackResponseStatus() {
  const v = vstack.init();
  const router = v.router({
    created: v.procedure.mutation(({ c }) => c.json({ ok: true }, 201)),
  });

  const result = await executeRoute(router, {
    path: '/created',
    method: 'POST',
    req: { body: {} },
    ctx: {},
    env: {},
  });

  assert.ok(result.data instanceof Response, 'Expected procedure Response returns to stay as Response');
  assert.equal(result.data.status, 201);
}

async function main() {
  checkClientManifestScansUtils();
  checkReactServerExports();
  checkGuardedManifest();
  checkCookieDecode();
  await checkNextResponseHeaders();
  await checkRouteBodyLimitAndCookies();
  await checkStackResponseStatus();
  console.log('[test:rsc-ssr-hardening] ALL PASSED');
}

main().catch((error) => {
  console.error('[test:rsc-ssr-hardening] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
