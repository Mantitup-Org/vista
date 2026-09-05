#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');

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

  throw new Error('No TypeScript runtime found for fullstack runtime tests.');
}

registerTypeScriptRuntime();

const {
  resolveLegacyRouteHandlerMatch,
  runLegacyApiRoute,
} = require(path.join(repoRoot, 'packages/vista/src/server/typed-api-runtime.ts'));
const { runMiddleware, applyMiddlewareResult, listMiddlewareFiles } = require(
  path.join(repoRoot, 'packages/vista/src/server/middleware-runner.ts')
);
const { agent, tool, mockProvider, discoverAgents } = require(
  path.join(repoRoot, 'packages/vista/src/ai/index.ts')
);
const { generateDeploymentOutputs } = require(
  path.join(repoRoot, 'packages/vista/src/bin/deploy-output.ts')
);

function writeFile(target, contents) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function main() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-fullstack-'));
  try {
    writeFile(
      path.join(cwd, 'app', 'api', 'health', 'route.js'),
      [
        'exports.GET = async function GET() {',
        "  return Response.json({ ok: true, message: 'Hello from Vista.js' });",
        '};',
        'exports.POST = async function POST(request) {',
        '  const body = await request.json();',
        '  return Response.json({ echo: body });',
        '};',
        '',
      ].join('\n')
    );
    writeFile(
      path.join(cwd, 'app', 'api', 'users', '[id]', 'route.js'),
      [
        'exports.GET = async function GET(_request, context) {',
        '  return Response.json({ id: context.params.id });',
        '};',
        'exports.PUT = async function PUT() { return Response.json({ method: "PUT" }); };',
        'exports.PATCH = async function PATCH() { return Response.json({ method: "PATCH" }); };',
        'exports.DELETE = async function DELETE() { return Response.json({ method: "DELETE" }); };',
        '',
      ].join('\n')
    );
    writeFile(
      path.join(cwd, 'middleware.js'),
      [
        'exports.middleware = async function middleware({ request, next }) {',
        "  if (request.nextUrl.pathname === '/blocked') {",
        "    return new Response('denied', { status: 401 });",
        '  }',
        '  const response = await next();',
        "  response.headers.set('x-vista-mw', 'root');",
        '  return response;',
        '};',
        '',
      ].join('\n')
    );
    writeFile(
      path.join(cwd, 'app', 'api', 'middleware.js'),
      [
        'exports.middleware = async function middleware({ next }) {',
        '  const response = await next();',
        "  response.headers.set('x-vista-route-mw', 'api');",
        '  return response;',
        '};',
        '',
      ].join('\n')
    );
    writeFile(
      path.join(cwd, 'app', 'agents', 'support', 'agent.js'),
      [
        `const { agent, tool, mockProvider } = require(${JSON.stringify(
          path.join(repoRoot, 'packages/vista/src/ai/index.ts')
        )});`,
        'const searchDocs = tool({',
        "  name: 'searchDocs',",
        "  description: 'Search docs',",
        '  async execute() { return { hits: ["routing"] }; },',
        '});',
        'exports.supportAgent = agent({',
        "  name: 'support',",
        '  model: mockProvider(["Hello from the support agent"]),',
        '  tools: [searchDocs],',
        '  memory: true,',
        '});',
        '',
      ].join('\n')
    );

    const health = resolveLegacyRouteHandlerMatch(cwd, '/api/health');
    assert.ok(health, 'health route should be discovered');
    assert.match(health.filePath.replace(/\\/g, '/'), /app\/api\/health\/route\.js$/);

    const user = resolveLegacyRouteHandlerMatch(cwd, '/api/users/42');
    assert.ok(user, 'dynamic API route should be discovered');
    assert.equal(user.params.id, '42');

    const express = require(
      require.resolve('express', { paths: [path.join(repoRoot, 'packages', 'vista')] })
    );
    const app = express();
    app.use(async (req, res, next) => {
      const result = await runMiddleware(req, cwd, true);
      if (applyMiddlewareResult(result, req, res)) return;
      next();
    });
    app.all('*', async (req, res) => {
      const match = resolveLegacyRouteHandlerMatch(cwd, req.path);
      if (!match) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      await runLegacyApiRoute({
        req,
        res,
        apiPath: match.filePath,
        isDev: true,
        params: match.params,
      });
    });

    const { server, url } = await listen(app);
    try {
      const getHealth = await fetch(`${url}/api/health`);
      assert.equal(getHealth.status, 200);
      assert.deepEqual(await getHealth.json(), { ok: true, message: 'Hello from Vista.js' });
      assert.equal(getHealth.headers.get('x-vista-mw'), 'root');
      assert.equal(getHealth.headers.get('x-vista-route-mw'), 'api');

      const blocked = await fetch(`${url}/blocked`);
      assert.equal(blocked.status, 401);
      assert.equal(
        await blocked.text(),
        'denied',
        'middleware short-circuit must forward the response body'
      );

      const created = await fetch(`${url}/api/health`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ping: true }),
      });
      assert.equal(created.status, 200);
      assert.deepEqual(await created.json(), { echo: { ping: true } });

      const userRes = await fetch(`${url}/api/users/99`);
      assert.deepEqual(await userRes.json(), { id: '99' });

      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const response = await fetch(`${url}/api/users/1`, { method });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { method });
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }

    const middlewareFiles = listMiddlewareFiles(cwd, '/api/health');
    assert.equal(middlewareFiles.length >= 2, true, 'root and route middleware should both run');

    const support = agent({
      name: 'inline-support',
      model: mockProvider(['cached answer']),
      tools: [
        tool({
          name: 'searchDocs',
          description: 'Search',
          execute: async () => ({ hits: 1 }),
        }),
      ],
      memory: true,
    });
    const result = await support.generate({ input: 'hello', sessionId: 's1' });
    assert.equal(result.text, 'cached answer');
    assert.equal(result.observation.agent, 'inline-support');

    const discovered = discoverAgents(cwd);
    assert.equal(discovered.some((entry) => entry.name === 'support'), true);

    const vistaDir = path.join(cwd, '.vista');
    generateDeploymentOutputs({ cwd, vistaDir });
    for (const file of ['Dockerfile', 'render.yaml', 'wrangler.toml', 'vercel.json', 'README.md']) {
      assert.equal(fs.existsSync(path.join(vistaDir, 'deploy', file)), true, `missing ${file}`);
    }

    console.log('Full-stack runtime verification passed.');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Full-stack runtime verification failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
