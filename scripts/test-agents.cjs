#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const vistaSrc = path.join(repoRoot, 'packages', 'vista', 'src');

const searchRoots = [repoRoot, path.join(repoRoot, 'packages', 'vista')];
const resolveFromWorkspace = (specifier) => {
  for (const root of searchRoots) {
    try {
      return require.resolve(specifier, { paths: [root] });
    } catch {}
  }
  throw new Error(`Unable to resolve ${specifier}`);
};

function registerTypeScriptRuntime() {
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

const { parseModelIdentifier, resolveModel, embedTexts } = require(path.join(vistaSrc, 'ai', 'index.ts'));
const { runGenerateCommand } = require(path.join(vistaSrc, 'bin', 'generate.ts'));

async function main() {
  assert.equal(parseModelIdentifier('nvidia:meta/llama-3.1-8b-instruct').provider, 'nvidia');
  assert.equal(parseModelIdentifier('groq:llama-3.1-8b-instant').provider, 'groq');

  const nvidia = resolveModel('nvidia:meta/llama-3.1-8b-instruct');
  assert.equal(nvidia.modelName, 'meta/llama-3.1-8b-instruct');
  const groq = resolveModel('groq:llama-3.1-8b-instant');
  assert.equal(groq.modelName, 'llama-3.1-8b-instant');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /integrate\.api\.nvidia\.com\/v1\/embeddings/);
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'nvidia/nv-embedqa-e5-v5');
    return new Response(JSON.stringify({ data: [{ embedding: [1, 0], index: 0 }] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const vectors = await embedTexts(['vista'], {
      model: 'nvidia:nvidia/nv-embedqa-e5-v5',
      apiKey: 'test',
    });
    assert.deepEqual(vectors, [[1, 0]]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-g-agent-'));
  try {
    const code = await runGenerateCommand(['agent', 'support'], { cwd, log() {} });
    assert.equal(code, 0);
    assert.equal(fs.existsSync(path.join(cwd, 'app', 'AGENTS.md')), true);
    assert.match(fs.readFileSync(path.join(cwd, 'app', 'AGENTS.md'), 'utf8'), /groq:/);

    const routeContent = fs.readFileSync(
      path.join(cwd, 'app', 'api', 'agents', 'support', 'route.ts'),
      'utf8'
    );
    assert.match(
      routeContent,
      /import \{ supportAgent \} from '\.\.\/\.\.\/\.\.\/agents\/support\/agent';/,
      'Route handler must import supportAgent from three directory levels up'
    );

    const authCode = await runGenerateCommand(['auth'], { cwd, log() {} });
    assert.equal(authCode, 0);
    const accountPageContent = fs.readFileSync(path.join(cwd, 'app', 'account', 'page.tsx'), 'utf8');
    assert.match(
      accountPageContent,
      /export const dynamic = 'force-dynamic';/,
      'Account page must export force-dynamic to prevent static prerender crash'
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }

  assert.equal(fs.existsSync(path.join(repoRoot, 'AGENTS.md')), true);

  // Regression test for issue #84: useAgent SSE error chunk handling
  const React = require(resolveFromWorkspace('react'));
  const ReactDOMServer = require(resolveFromWorkspace('react-dom/server'));
  const { useAgent } = require(path.join(vistaSrc, 'ai', 'react', 'use-agent.ts'));

  let finishCalled = false;
  let errorReceived = null;
  let hookInstance;

  function TestHookComponent() {
    hookInstance = useAgent({
      api: 'http://localhost:9999/chat',
      onError: (err) => {
        errorReceived = err;
      },
      onFinish: () => {
        finishCalled = true;
      },
    });
    return null;
  }

  ReactDOMServer.renderToString(React.createElement(TestHookComponent));

  globalThis.fetch = async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"error","error":"provider failed"}\n\ndata: [DONE]\n\n'
          )
        );
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  await hookInstance.handleSubmit(null, { prompt: 'test error propagation' });
  assert.equal(finishCalled, false, 'onFinish must NOT be called when SSE returns an error chunk');
  assert.ok(errorReceived, 'onError must be called when SSE returns an error chunk');
  assert.equal(errorReceived.message, 'provider failed');

  console.log('[test:agents] ALL PASSED');
}

main().catch((error) => {
  console.error('[test:agents] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
