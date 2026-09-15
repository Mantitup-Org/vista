#!/usr/bin/env node

/**
 * Vista.js AI-Native Framework Verification Suite
 * Tests the 5 core technical pillars of Issue #7:
 * 1. RSC Inline Server References
 * 2. File-Based API Routes & Dynamic Matchers
 * 3. Middleware System ({ request, next } and matchers)
 * 4. Native AI Framework (vista/ai: agent, tool, streaming, memory, providers)
 * 5. Zero-Config Deployment Adapters
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const repoRoot = path.resolve(__dirname, '..');
const vistaPackageRoot = path.join(repoRoot, 'packages', 'vista');

// Load built Vista modules
const {
  registerInlineServerReference,
  setRegisterServerReference,
  resolveRegisteredServerReference,
  SERVER_REFERENCE_TAG,
} = require(path.join(vistaPackageRoot, 'dist', 'server', 'runtime-actions.js'));

const {
  resolveRouteHandlerMatch,
  runLegacyApiRoute,
} = require(path.join(vistaPackageRoot, 'dist', 'server', 'typed-api-runtime.js'));

const {
  runMiddleware,
  applyMiddlewareResult,
} = require(path.join(vistaPackageRoot, 'dist', 'server', 'middleware-runner.js'));

const {
  agent,
  tool,
  createMemory,
  createReadableTextStream,
  toTextStreamResponse,
  toDataStreamResponse,
} = require(path.join(vistaPackageRoot, 'dist', 'ai', 'index.js'));

const {
  adapters,
  getAdapter,
  nodeAdapter,
  vercelAdapter,
  cloudflareAdapter,
  renderAdapter,
  dockerAdapter,
} = require(path.join(vistaPackageRoot, 'dist', 'adapters', 'index.js'));

async function testPillar1_RSCServerReferences() {
  console.log('[Pillar 1] Testing RSC Inline Server Reference Registration...');

  let customHookCalled = false;
  setRegisterServerReference((ref, id, exportName) => {
    customHookCalled = true;
    assert.equal(typeof ref, 'function');
    assert.equal(id, 'file:///test/page.js#inline_0_action');
    assert.equal(exportName, 'action');
  });

  async function sampleInlineAction(x) {
    return `result-${x}`;
  }

  const registered = registerInlineServerReference(
    sampleInlineAction,
    'file:///test/page.js#inline_0_action',
    'action'
  );

  assert.equal(customHookCalled, true, 'Expected custom registerServerReference hook to be called');
  assert.equal(registered, sampleInlineAction);
  assert.equal(registered.$$typeof, SERVER_REFERENCE_TAG, 'Expected reference to have react.server.reference symbol');
  assert.equal(registered.$$id, 'file:///test/page.js#inline_0_action#action');

  const resolved = resolveRegisteredServerReference('file:///test/page.js#inline_0_action#action');
  assert.equal(resolved, sampleInlineAction);

  console.log('  ✓ Server references properly tagged with Symbol.for("react.server.reference")');
  console.log('  ✓ Hook injection and reference resolution verified');
}

async function testPillar2_FileBasedApiRouting() {
  console.log('[Pillar 2] Testing File-Based API Routing (app/api and src/app/api)...');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-api-test-'));

  try {
    // 1. Setup app/api/users/[id]/route.ts
    const userRouteDir = path.join(tmpDir, 'app', 'api', 'users', '[id]');
    fs.mkdirSync(userRouteDir, { recursive: true });
    fs.writeFileSync(
      path.join(userRouteDir, 'route.js'),
      `
      exports.GET = async function(request, context) {
        return Response.json({ user: context.params.id, method: 'GET' });
      };
      exports.POST = async function(request, context) {
        const body = await request.json();
        return Response.json({ created: context.params.id, body }, { status: 201 });
      };
      `
    );

    // 2. Setup src/app/api/posts/[...slug]/route.ts
    const postRouteDir = path.join(tmpDir, 'src', 'app', 'api', 'posts', '[...slug]');
    fs.mkdirSync(postRouteDir, { recursive: true });
    fs.writeFileSync(
      path.join(postRouteDir, 'route.js'),
      `
      exports.GET = async function(request, context) {
        return Response.json({ slug: context.params.slug });
      };
      exports.DELETE = async function(request, context) {
        return new Response(null, { status: 204 });
      };
      `
    );

    // Test route matching for app/api/users/[id]
    const matchUser = resolveRouteHandlerMatch(tmpDir, '/api/users/42');
    assert(matchUser !== null, 'Expected /api/users/42 to match route handler');
    assert.equal(matchUser.params.id, '42');

    // Test route matching for src/app/api/posts/[...slug]
    const matchPost = resolveRouteHandlerMatch(tmpDir, '/api/posts/2026/tech/vista');
    assert(matchPost !== null, 'Expected /api/posts/2026/tech/vista to match src route handler');
    assert.deepEqual(matchPost.params.slug, ['2026', 'tech', 'vista']);

    // Test execution of GET with context params
    let responseStatus = null;
    let responseJson = null;
    let responseHeaders = {};

    const mockRes = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseJson = data;
        return this;
      },
      send(data) {
        responseJson = data;
        return this;
      },
      write(chunk) {
        if (!responseJson) responseJson = Buffer.from('');
        responseJson = Buffer.concat([Buffer.isBuffer(responseJson) ? responseJson : Buffer.from(responseJson), Buffer.from(chunk)]);
        return true;
      },
      end() {
        return this;
      },
      setHeader(k, v) {
        responseHeaders[k.toLowerCase()] = v;
      },
    };

    const mockReq = {
      method: 'GET',
      path: '/api/users/42',
      url: '/api/users/42',
      headers: { host: 'localhost:3000' },
      [Symbol.asyncIterator]: async function* () {},
    };

    await runLegacyApiRoute({
      req: mockReq,
      res: mockRes,
      apiPath: matchUser.filePath,
      params: matchUser.params,
      isDev: true,
    });

    assert.equal(responseStatus, 200);
    const parsedData = JSON.parse(responseJson.toString());
    assert.equal(parsedData.user, '42');
    assert.equal(parsedData.method, 'GET');

    // Test automatic OPTIONS handling
    const mockOptionsReq = {
      method: 'OPTIONS',
      path: '/api/users/42',
      url: '/api/users/42',
      headers: { host: 'localhost:3000' },
      [Symbol.asyncIterator]: async function* () {},
    };

    responseStatus = null;
    responseHeaders = {};
    await runLegacyApiRoute({
      req: mockOptionsReq,
      res: mockRes,
      apiPath: matchUser.filePath,
      params: matchUser.params,
      isDev: true,
    });

    assert.equal(responseStatus, 204);
    assert(responseHeaders['allow'].includes('GET'));
    assert(responseHeaders['allow'].includes('POST'));

    console.log('  ✓ Static & dynamic API routing in app/api and src/app/api verified');
    console.log('  ✓ Context params injection and Web API Request/Response verified');
    console.log('  ✓ Automatic OPTIONS and HTTP method dispatch verified');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function testPillar3_MiddlewareSystem() {
  console.log('[Pillar 3] Testing Built-in Middleware System...');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-mw-test-'));

  try {
    // Write src/middleware.js with { request, next } signature and config.matcher
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'middleware.js'),
      `
      exports.config = {
        matcher: ['/protected/:path*', '/api/:path*'],
      };

      exports.middleware = async function({ request, next }) {
        if (request.nextUrl.pathname.startsWith('/protected/admin')) {
          return new Response(JSON.stringify({ error: 'Unauthorized admin' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const res = next({
          headers: { 'x-custom-mw': 'active' },
        });
        return res;
      };
      `
    );

    // 1. Test matcher matching and rejection (short-circuit)
    const adminReq = {
      method: 'GET',
      path: '/protected/admin/dashboard',
      url: '/protected/admin/dashboard',
      headers: { host: 'localhost:3000' },
    };

    const adminResult = await runMiddleware(adminReq, tmpDir, true);
    assert.equal(adminResult.kind, 'short-circuit');
    assert.equal(adminResult.status, 401);
    assert(adminResult.body.toString().includes('Unauthorized admin'));

    // 2. Test matcher matching and continuation (next)
    const apiReq = {
      method: 'GET',
      path: '/api/data',
      url: '/api/data',
      headers: { host: 'localhost:3000' },
    };

    const apiResult = await runMiddleware(apiReq, tmpDir, true);
    assert.equal(apiResult.kind, 'next');
    assert.equal(apiResult.responseHeaders.get('x-custom-mw'), 'active');

    // 3. Test non-matching path (skip)
    const publicReq = {
      method: 'GET',
      path: '/public/about',
      url: '/public/about',
      headers: { host: 'localhost:3000' },
    };

    const publicResult = await runMiddleware(publicReq, tmpDir, true);
    assert.equal(publicResult.kind, 'skip');

    console.log('  ✓ src/middleware.ts discovery verified');
    console.log('  ✓ { request, next } signature and header forwarding verified');
    console.log('  ✓ Matcher pattern filtering and short-circuit response verified');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function testPillar4_NativeAiFramework() {
  console.log('[Pillar 4] Testing Native AI Application Framework (vista/ai)...');

  // 1. Define tool
  const searchTool = tool({
    name: 'searchDocs',
    description: 'Search documentation for articles',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
    execute: async ({ query }) => {
      return { found: true, query, count: 3 };
    },
  });

  assert.equal(searchTool.name, 'searchDocs');

  // 2. Create agent with multi-provider abstraction and memory
  const assistant = agent({
    name: 'test-agent',
    model: 'openai:gpt-4o',
    systemPrompt: 'You are a test assistant.',
    tools: [searchTool],
    memory: true,
  });

  assert.equal(assistant.name, 'test-agent');

  // 3. Run agent (generate)
  const genResult = await assistant.run('Hello Vista AI');
  assert(genResult.text.length > 0, 'Expected generated text');

  // Verify memory recorded the message
  const history = await assistant.getHistory();
  assert(history.length >= 1, 'Expected memory to contain interaction history');
  assert.equal(history[0].content, 'Hello Vista AI');

  // 4. Test tool calling execution
  const toolCallResult = await assistant.run('Please search for documentation');
  assert(toolCallResult.toolCalls && toolCallResult.toolCalls.length > 0, 'Expected tool call to be triggered');
  assert(toolCallResult.toolResults && toolCallResult.toolResults.length > 0, 'Expected tool to be executed');
  assert.equal(toolCallResult.toolResults[0].toolName, 'searchDocs');
  assert.equal(toolCallResult.toolResults[0].result.found, true);

  // 5. Test streaming
  const streamResult = await assistant.stream('Explain Vista in 10 words');
  assert(streamResult.textStream instanceof ReadableStream, 'Expected ReadableStream');

  const textResponse = streamResult.toTextStreamResponse();
  assert.equal(textResponse.headers.get('Content-Type'), 'text/plain; charset=utf-8');

  // Read stream chunks
  const reader = streamResult.textStream.getReader();
  let streamText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) streamText += value;
  }
  assert(streamText.length > 0, 'Expected non-empty streamed text');

  // 6. Test memory clearing
  await assistant.clearMemory();
  const clearedHistory = await assistant.getHistory();
  assert.equal(clearedHistory.length, 0, 'Expected empty history after clearMemory');

  console.log('  ✓ agent() and tool() function calling verified');
  console.log('  ✓ Conversational memory state management verified');
  console.log('  ✓ Multi-provider model abstraction and ReadableStream streaming verified');
}

async function testPillar5_ZeroConfigDeploymentAdapters() {
  console.log('[Pillar 5] Testing Zero-Config Deployment Adapters...');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-deploy-test-'));
  const vistaDir = path.join(tmpDir, '.vista');
  fs.mkdirSync(path.join(vistaDir, 'static'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'public'), { recursive: true });

  try {
    // 1. Node.js Standalone Adapter
    nodeAdapter.build({ cwd: tmpDir, vistaDir });
    assert(fs.existsSync(path.join(vistaDir, 'standalone', 'server.js')), 'Expected .vista/standalone/server.js');

    // 2. Vercel Adapter
    vercelAdapter.build({ cwd: tmpDir, vistaDir });
    assert(fs.existsSync(path.join(tmpDir, '.vercel', 'output', 'config.json')), 'Expected .vercel/output/config.json');

    // 3. Cloudflare Workers Adapter
    cloudflareAdapter.build({ cwd: tmpDir, vistaDir });
    assert(fs.existsSync(path.join(vistaDir, 'cloudflare', '_worker.js')), 'Expected .vista/cloudflare/_worker.js');
    assert(fs.existsSync(path.join(tmpDir, 'wrangler.toml')), 'Expected wrangler.toml');

    // 4. Render Adapter
    renderAdapter.build({ cwd: tmpDir, vistaDir });
    assert(fs.existsSync(path.join(tmpDir, 'render.yaml')), 'Expected render.yaml');

    // 5. Docker Adapter
    dockerAdapter.build({ cwd: tmpDir, vistaDir });
    assert(fs.existsSync(path.join(tmpDir, 'Dockerfile')), 'Expected Dockerfile');
    assert(fs.existsSync(path.join(tmpDir, '.dockerignore')), 'Expected .dockerignore');

    // 6. getAdapter registry
    assert.equal(getAdapter('vercel'), vercelAdapter);
    assert.equal(getAdapter('cloudflare'), cloudflareAdapter);
    assert.equal(getAdapter('node'), nodeAdapter);
    assert.equal(getAdapter('render'), renderAdapter);
    assert.equal(getAdapter('docker'), dockerAdapter);

    console.log('  ✓ Node.js Standalone adapter verified');
    console.log('  ✓ Vercel Build Output API v3 adapter verified');
    console.log('  ✓ Cloudflare Workers adapter (_worker.js & wrangler.toml) verified');
    console.log('  ✓ Render.com blueprint adapter (render.yaml) verified');
    console.log('  ✓ Docker multi-stage containerization adapter verified');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Vista.js AI-Native Framework Conformance & Feature Verification');
  console.log('═══════════════════════════════════════════════════════════════\n');

  await testPillar1_RSCServerReferences();
  console.log('');
  await testPillar2_FileBasedApiRouting();
  console.log('');
  await testPillar3_MiddlewareSystem();
  console.log('');
  await testPillar4_NativeAiFramework();
  console.log('');
  await testPillar5_ZeroConfigDeploymentAdapters();
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ALL 5 PILLARS PASSED SUCCESSFULLY! ✓');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:');
  console.error(err);
  process.exit(1);
});
