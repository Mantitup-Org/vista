#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const vistaDist = path.join(repoRoot, 'packages', 'vista', 'dist');

// Import provider, embedding, and code generation modules directly
const { parseModelIdentifier, resolveModel } = require(path.join(vistaDist, 'ai', 'providers', 'base.js'));
const { createOpenAIModel } = require(path.join(vistaDist, 'ai', 'providers', 'openai.js'));
const { embedTexts } = require(path.join(vistaDist, 'ai', 'embeddings.js'));
const { runGenerateCommand } = require(path.join(vistaDist, 'bin', 'generate.js'));

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

  // Verify OpenAI streaming tool call accumulation across split delta chunks
  const openAIModel = createOpenAIModel({ model: 'gpt-4o', apiKey: 'mock-key' });
  const streamChunks = [
    'data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_test1', type: 'function', function: { name: 'get_stock_price', arguments: '{"sym' } }] } }] }) + '\n\n',
    'data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'bol": "AAPL"}' } }] } }] }) + '\n\n',
    'data: ' + JSON.stringify({ choices: [{ finish_reason: 'tool_calls' }] }) + '\n\n',
    'data: [DONE]\n\n',
  ];

  const fakeStreamResponse = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const sc of streamChunks) {
        controller.enqueue(encoder.encode(sc));
      }
      controller.close();
    },
  });

  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(fakeStreamResponse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

  try {
    const collectedChunks = [];
    for await (const chunk of openAIModel.streamText({ messages: [{ role: 'user', content: 'check AAPL' }] })) {
      collectedChunks.push(chunk);
    }
    const toolCallChunks = collectedChunks.filter((c) => c.type === 'tool-call');
    assert.equal(toolCallChunks.length, 1, 'Must emit exactly one consolidated tool call, not fragmented chunks');
    assert.equal(toolCallChunks[0].toolCall.id, 'call_test1');
    assert.equal(toolCallChunks[0].toolCall.name, 'get_stock_price');
    assert.deepEqual(toolCallChunks[0].toolCall.arguments, { symbol: 'AAPL' }, 'Must parse complete accumulated arguments JSON');
  } finally {
    globalThis.fetch = prevFetch;
  }

  assert.equal(fs.existsSync(path.join(repoRoot, 'AGENTS.md')), true);

  console.log('[test:agents] ALL PASSED');
}

main().catch((error) => {
  console.error('[test:agents] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
