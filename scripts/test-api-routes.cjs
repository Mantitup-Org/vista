#!/usr/bin/env node

/**
 * File-based API route handler verification (`app/**\/route.{ts,tsx,js,jsx}`).
 *
 * Covers the three things the feature promises, without needing a dev server, a
 * production build, or a Rust toolchain:
 *
 *   1. detection  - route files are discovered and registered in the build manifests
 *   2. dispatch   - GET/POST/PUT/PATCH/DELETE (plus HEAD/OPTIONS) reach their exports,
 *                   with dynamic segments arriving as params
 *   3. isolation  - route handlers are never treated as client modules
 *
 * The end-to-end HTTP behaviour on both engines is asserted by
 * scripts/test-rsc-conformance.cjs; this script is the fast guard.
 */

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

  try {
    require(resolveFromWorkspace('ts-node')).register({
      transpileOnly: true,
      compilerOptions: {
        module: 'commonjs',
        jsx: 'react-jsx',
        moduleResolution: 'node16',
        esModuleInterop: true,
      },
    });
    return;
  } catch {}

  throw new Error('No TypeScript runtime found for API route tests.');
}

registerTypeScriptRuntime();

const vistaSrc = path.join(repoRoot, 'packages', 'vista', 'src');
const routePatterns = require(path.join(vistaSrc, 'server', 'route-patterns.ts'));
const routeRegistry = require(path.join(vistaSrc, 'server', 'route-handler-registry.ts'));
const typedApiRuntime = require(path.join(vistaSrc, 'server', 'typed-api-runtime.ts'));
const buildManifest = require(path.join(vistaSrc, 'build', 'manifest.ts'));
const { generateServerManifest } = require(
  path.join(vistaSrc, 'build', 'rsc', 'server-manifest.ts')
);

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

function createFixture(projectDir) {
  const appDir = path.join(projectDir, 'app');

  // A page, so route handlers are proven to coexist with frontend code.
  writeFile(
    path.join(appDir, 'page.js'),
    ['export default function Home() {', '  return null', '}', ''].join('\n')
  );

  // Server-only module, imported only by a route handler.
  writeFile(
    path.join(appDir, 'api', 'echo', 'secrets.js'),
    [
      "export const SERVER_ONLY_TOKEN = 'api-route-server-only-token'",
      '',
      'export function stamp(method) {',
      '  return { method, token: SERVER_ONLY_TOKEN }',
      '}',
      '',
    ].join('\n')
  );

  writeFile(
    path.join(appDir, 'api', 'echo', 'route.js'),
    [
      "import { stamp } from './secrets'",
      '',
      'export async function GET() {',
      "  return Response.json(stamp('GET'))",
      '}',
      '',
      'export async function POST(request) {',
      '  const body = await request.json().catch(() => null)',
      "  return Response.json({ ...stamp('POST'), body })",
      '}',
      '',
      'export async function PUT() {',
      "  return Response.json(stamp('PUT'))",
      '}',
      '',
      'export async function PATCH() {',
      "  return Response.json(stamp('PATCH'))",
      '}',
      '',
      'export async function DELETE() {',
      "  return Response.json(stamp('DELETE'))",
      '}',
      '',
    ].join('\n')
  );

  // Dynamic, catch-all, optional catch-all, plus a static sibling that must win.
  writeFile(
    path.join(appDir, 'api', 'users', '[id]', 'route.js'),
    [
      'export async function GET(request, context) {',
      "  return Response.json({ kind: 'dynamic', id: context.params.id })",
      '}',
      '',
    ].join('\n')
  );
  writeFile(
    path.join(appDir, 'api', 'users', 'me', 'route.js'),
    [
      'export async function GET() {',
      "  return Response.json({ kind: 'static' })",
      '}',
      '',
    ].join('\n')
  );
  writeFile(
    path.join(appDir, 'api', 'files', '[...segments]', 'route.js'),
    [
      'export async function GET(request, context) {',
      "  return Response.json({ kind: 'catch-all', segments: context.params.segments })",
      '}',
      '',
    ].join('\n')
  );
  writeFile(
    path.join(appDir, 'api', 'optional', '[[...rest]]', 'route.js'),
    [
      'export async function GET(request, context) {',
      "  return Response.json({ kind: 'optional', rest: context.params.rest })",
      '}',
      '',
    ].join('\n')
  );

  // Route handlers are not restricted to /api.
  writeFile(
    path.join(appDir, 'health', 'route.js'),
    [
      "export const runtime = 'edge'",
      '',
      'export async function GET() {',
      "  return Response.json({ kind: 'health' })",
      '}',
      '',
    ].join('\n')
  );

  // Route group: grouping only, contributes nothing to the URL.
  writeFile(
    path.join(appDir, '(internal)', 'metrics', 'route.js'),
    [
      'export async function GET() {',
      "  return Response.json({ kind: 'metrics' })",
      '}',
      '',
    ].join('\n')
  );

  // A parallel-route slot is not URL addressable and must be ignored.
  writeFile(
    path.join(appDir, '@sidebar', 'hidden', 'route.js'),
    ['export async function GET() {', '  return Response.json({})', '}', ''].join('\n')
  );

  // A real client component, so the isolation check below is comparing against a
  // scanner that demonstrably finds client modules rather than passing vacuously.
  writeFile(
    path.join(appDir, 'counter.js'),
    [
      "'use client'",
      '',
      'export default function Counter() {',
      '  return null',
      '}',
      '',
    ].join('\n')
  );

  return appDir;
}

// ---------------------------------------------------------------------------
// Minimal express-shaped req/res doubles, so dispatch is testable without a server
// ---------------------------------------------------------------------------

function createRequest({ method = 'GET', url = '/', body }) {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
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
    },
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
    // The runtime reads the raw body by async-iterating the request stream.
    async *[Symbol.asyncIterator]() {
      if (payload) yield payload;
    },
  };
  if (payload) {
    request.body = body;
    request.rawBody = payload;
  }
  return request;
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
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
    set(name, value) {
      return this.setHeader(name, value);
    },
    json(payload) {
      this.body = JSON.stringify(payload);
      this.ended = true;
      return this;
    },
    send(payload) {
      this.body = typeof payload === 'string' ? payload : String(payload ?? '');
      this.ended = true;
      return this;
    },
    write(chunk) {
      this.body += chunk;
      return true;
    },
    end(chunk) {
      if (chunk) this.body += chunk;
      this.ended = true;
      return this;
    },
  };
}

async function callRoute(projectDir, method, requestPath, body) {
  const match = typedApiRuntime.resolveRouteHandlerMatch(projectDir, requestPath);
  assert.ok(match, `Expected a route handler match for ${method} ${requestPath}`);

  const res = createResponse();
  await typedApiRuntime.runLegacyApiRoute({
    req: createRequest({ method, url: requestPath, body }),
    res,
    apiPath: match.filePath,
    params: match.params,
    isDev: false,
  });

  let json = null;
  try {
    json = res.body ? JSON.parse(res.body) : null;
  } catch {
    json = null;
  }
  return { res, json, match };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkPatternParsing() {
  const cases = [
    { segments: ['api', 'hello'], pattern: '/api/hello', type: 'static' },
    { segments: ['api', 'users', '[id]'], pattern: '/api/users/:id', type: 'dynamic' },
    {
      segments: ['api', 'files', '[...segments]'],
      pattern: '/api/files/:segments*',
      type: 'catch-all',
    },
    {
      segments: ['api', 'optional', '[[...rest]]'],
      pattern: '/api/optional/:rest*?',
      type: 'catch-all',
    },
    { segments: ['(internal)', 'metrics'], pattern: '/metrics', type: 'static' },
  ];

  for (const testCase of cases) {
    const parsed = routePatterns.parseRouteSegments(testCase.segments);
    assert.ok(parsed, `Expected ${testCase.segments.join('/')} to parse`);
    assert.equal(parsed.pattern, testCase.pattern);
    assert.equal(parsed.type, testCase.type);
  }

  assert.equal(
    routePatterns.parseRouteSegments(['@sidebar', 'hidden']),
    null,
    'Parallel route slots are not URL addressable'
  );
  assert.equal(
    routePatterns.parseRouteSegments(['(.)modal']),
    null,
    'Interception routes are not URL addressable'
  );

  // Matching, including the cases that make catch-alls tricky.
  const dynamic = routePatterns.parseRouteSegments(['api', 'users', '[id]']);
  assert.deepEqual(routePatterns.matchRouteSegments(dynamic, ['api', 'users', '7']), { id: '7' });
  assert.equal(
    routePatterns.matchRouteSegments(dynamic, ['api', 'users']),
    null,
    'A dynamic segment must not match a missing segment'
  );
  assert.equal(
    routePatterns.matchRouteSegments(dynamic, ['api', 'users', '7', 'extra']),
    null,
    'A dynamic route must not swallow extra segments'
  );

  const catchAll = routePatterns.parseRouteSegments(['api', 'files', '[...segments]']);
  assert.deepEqual(routePatterns.matchRouteSegments(catchAll, ['api', 'files', 'a', 'b']), {
    segments: ['a', 'b'],
  });
  assert.equal(
    routePatterns.matchRouteSegments(catchAll, ['api', 'files']),
    null,
    'A required catch-all must not match an empty tail'
  );

  const optional = routePatterns.parseRouteSegments(['api', 'optional', '[[...rest]]']);
  assert.deepEqual(routePatterns.matchRouteSegments(optional, ['api', 'optional']), { rest: [] });
  assert.deepEqual(routePatterns.matchRouteSegments(optional, ['api', 'optional', 'x']), {
    rest: ['x'],
  });
}

function checkDiscovery(appDir) {
  const discovered = routeRegistry.discoverRouteHandlers(appDir);
  const patterns = discovered.map((entry) => entry.pattern).sort();

  assert.deepEqual(
    patterns,
    [
      '/api/echo',
      '/api/files/:segments*',
      '/api/optional/:rest*?',
      '/api/users/:id',
      '/api/users/me',
      '/health',
      '/metrics',
    ],
    'Unexpected set of discovered route handlers'
  );

  const echo = discovered.find((entry) => entry.pattern === '/api/echo');
  assert.deepEqual(
    echo.methods,
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    'Expected the exported HTTP methods to be detected'
  );

  const health = discovered.find((entry) => entry.pattern === '/health');
  assert.equal(health.runtime, 'edge', 'Expected `export const runtime` to be detected');

  // Static routes must be ordered ahead of the dynamic ones they overlap with.
  const meIndex = discovered.findIndex((entry) => entry.pattern === '/api/users/me');
  const idIndex = discovered.findIndex((entry) => entry.pattern === '/api/users/:id');
  assert.ok(
    meIndex < idIndex,
    'Expected the static /api/users/me to be ordered before /api/users/:id'
  );
}

function checkManifestRegistration(projectDir, appDir) {
  const manifest = generateServerManifest(projectDir, appDir);
  const patterns = manifest.routeHandlers.map((entry) => entry.pattern);

  assert.ok(
    patterns.includes('/api/echo'),
    `Expected the server manifest to register /api/echo, found ${JSON.stringify(patterns)}`
  );
  assert.ok(
    patterns.includes('/api/users/:id'),
    'Expected the server manifest to register dynamic route handlers'
  );
  assert.ok(
    manifest.routes.every((route) => !route.pagePath.endsWith('route.js')),
    'Route handlers must not be registered as page routes'
  );

  // The emitted manifests are what a deployment adapter reads.
  const vistaDir = path.join(projectDir, '.vista-manifest-check');
  fs.mkdirSync(vistaDir, { recursive: true });
  const routesManifest = buildManifest.generateRoutesManifest(
    vistaDir,
    [],
    [],
    manifest.routeHandlers.map((entry) => ({
      pattern: entry.pattern,
      filePath: entry.filePath,
      type: entry.type,
      methods: entry.methods,
      runtime: entry.runtime,
    }))
  );
  assert.equal(
    routesManifest.routeHandlers.length,
    manifest.routeHandlers.length,
    'Expected every discovered route handler in routes-manifest.json'
  );

  const dynamicEntry = routesManifest.routeHandlers.find((entry) =>
    entry.page.includes(path.join('users', '[id]'))
  );
  assert.equal(
    dynamicEntry.regex,
    '^/api/users/(?<id>[^/]+)$',
    'Expected a named-capture regex for the dynamic route handler'
  );

  const appPathRoutes = buildManifest.generateAppPathRoutesManifest(
    vistaDir,
    [],
    manifest.routeHandlers
  );
  assert.ok(
    appPathRoutes['/api/echo'],
    'Expected route handlers in app-path-routes-manifest.json'
  );

  // A page and a route handler cannot both own a URL; the page wins.
  const contested = buildManifest.generateAppPathRoutesManifest(
    vistaDir,
    [{ pattern: '/api/echo', pagePath: '/pages/echo/page.js', type: 'static' }],
    manifest.routeHandlers
  );
  assert.equal(
    contested['/api/echo'],
    '/pages/echo/page.js',
    'Expected a page route to win over a route handler on the same pattern'
  );
}

async function checkMethodDispatch(projectDir) {
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    const { res, json } = await callRoute(projectDir, method, '/api/echo');
    assert.equal(res.statusCode, 200, `Expected 200 for ${method} /api/echo`);
    assert.equal(json.method, method, `Expected ${method} to reach the ${method} export`);
  }

  const posted = await callRoute(projectDir, 'POST', '/api/echo', { hello: 'world' });
  assert.equal(posted.json.method, 'POST');
  assert.deepEqual(
    posted.json.body,
    { hello: 'world' },
    'Expected the POST handler to receive the parsed request body'
  );

  // HEAD reuses the GET handler.
  const head = await callRoute(projectDir, 'HEAD', '/api/echo');
  assert.equal(head.res.statusCode, 200, 'Expected HEAD to fall back to the GET handler');

  // OPTIONS is answered from the exported method list.
  const options = await callRoute(projectDir, 'OPTIONS', '/api/echo');
  assert.equal(options.res.statusCode, 204, 'Expected OPTIONS to be answered automatically');
  assert.equal(
    options.res.getHeader('allow'),
    'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Expected OPTIONS to advertise the supported methods'
  );

  // An unsupported method is a 405 that says what is supported.
  const notAllowed = await callRoute(projectDir, 'POST', '/api/users/me');
  assert.equal(notAllowed.res.statusCode, 405, 'Expected 405 for an unexported method');
  assert.equal(notAllowed.res.getHeader('allow'), 'GET, OPTIONS');
}

async function checkParamResolution(projectDir) {
  const dynamic = await callRoute(projectDir, 'GET', '/api/users/42');
  assert.equal(dynamic.json.kind, 'dynamic');
  assert.equal(dynamic.json.id, '42', 'Expected the dynamic segment as context.params.id');

  const staticWins = await callRoute(projectDir, 'GET', '/api/users/me');
  assert.equal(
    staticWins.json.kind,
    'static',
    'Expected the static route to win over the dynamic sibling'
  );

  const catchAll = await callRoute(projectDir, 'GET', '/api/files/a/b/c.txt');
  assert.deepEqual(
    catchAll.json.segments,
    ['a', 'b', 'c.txt'],
    'Expected catch-all params as an ordered array'
  );

  const optionalEmpty = await callRoute(projectDir, 'GET', '/api/optional');
  assert.deepEqual(optionalEmpty.json.rest, [], 'Expected an optional catch-all to match bare');

  const optionalFilled = await callRoute(projectDir, 'GET', '/api/optional/x/y');
  assert.deepEqual(optionalFilled.json.rest, ['x', 'y']);

  const grouped = await callRoute(projectDir, 'GET', '/metrics');
  assert.equal(grouped.json.kind, 'metrics', 'Expected route groups to be stripped from the URL');

  // Encoded segments are decoded before reaching the handler.
  const encoded = await callRoute(projectDir, 'GET', '/api/users/a%20b');
  assert.equal(encoded.json.id, 'a b', 'Expected percent-encoded params to be decoded');

  // Unmatched paths stay unmatched.
  assert.equal(
    typedApiRuntime.resolveRouteHandlerMatch(projectDir, '/api/does-not-exist'),
    null,
    'Expected no match for an unknown path'
  );
  assert.equal(
    typedApiRuntime.resolveRouteHandlerMatch(projectDir, '/sidebar/hidden'),
    null,
    'Expected parallel-route slots to stay unreachable'
  );
}

function checkClientIsolation(projectDir, appDir) {
  const manifest = generateServerManifest(projectDir, appDir);

  // Nothing under a route handler may be advertised as a client module.
  for (const entry of Object.values(manifest.serverModules)) {
    assert.ok(
      !entry.clientDependencies.some((dependency) => dependency.includes('route')),
      `Server module ${entry.path} lists a route handler as a client dependency`
    );
  }

  // The route handler and the server-only module it imports must not be reachable
  // through the client component scanner.
  const {
    generateClientManifest,
  } = require(path.join(vistaSrc, 'build', 'rsc', 'client-manifest.ts'));
  const clientManifest = generateClientManifest(projectDir, appDir);
  const clientModulePaths = Object.values(clientManifest.clientModules || {}).map((entry) =>
    String(entry.filePath || entry.path || '')
  );

  // Guard against a vacuous pass: the scanner must actually be finding client code.
  assert.ok(
    clientModulePaths.some((modulePath) => modulePath.includes('counter.js')),
    'Expected the client scanner to pick up the "use client" component in the fixture'
  );

  const leaked = clientModulePaths.filter(
    (modulePath) => modulePath.includes('route.js') || modulePath.includes('secrets.js')
  );
  assert.deepEqual(
    leaked,
    [],
    `Route handler modules must never enter the client manifest: ${leaked.join(', ')}`
  );

  // The server-only token must not be reachable from any client module's source.
  for (const modulePath of clientModulePaths) {
    if (!modulePath || !fs.existsSync(modulePath)) continue;
    assert.ok(
      !fs.readFileSync(modulePath, 'utf8').includes('api-route-server-only-token'),
      `Server-only route handler code leaked into client module ${modulePath}`
    );
  }
}

async function main() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-api-routes-'));
  try {
    const appDir = createFixture(projectDir);

    checkPatternParsing();
    checkDiscovery(appDir);
    checkManifestRegistration(projectDir, appDir);
    await checkMethodDispatch(projectDir);
    await checkParamResolution(projectDir);
    checkClientIsolation(projectDir, appDir);

    console.log('API route verification passed.');
  } finally {
    routeRegistry.clearRouteHandlerCache();
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('API route verification failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
