const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// 1. Mock React for testing useAgent in Node.js environment
const mockReactState = new Map();
let stateIndex = 0;

const mockReact = {
  useState(initial) {
    const idx = stateIndex++;
    if (!mockReactState.has(idx)) {
      mockReactState.set(idx, typeof initial === 'function' ? initial() : initial);
    }
    const setter = (val) => {
      const prev = mockReactState.get(idx);
      const next = typeof val === 'function' ? val(prev) : val;
      mockReactState.set(idx, next);
      return next;
    };
    return [mockReactState.get(idx), setter];
  },
  useRef(initial) {
    return { current: initial };
  },
  useCallback(fn) {
    return fn;
  },
};

// Install mock react into require cache
const Module = require('node:module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'react') {
    return 'react';
  }
  return origResolve.call(this, request, parent, isMain, options);
};
require.cache['react'] = {
  id: 'react',
  filename: 'react',
  loaded: true,
  exports: mockReact,
};

// Import modules under test
const { Agent, agent } = require('../../dist/ai/agent.js');
const { useAgent } = require('../../dist/ai/react/use-agent.js');

test('Issue #109: Agent.run() records model errors to telemetry before rethrowing', async () => {
  let capturedError = null;
  const recordedSteps = [];

  const failingModel = {
    provider: 'mock',
    modelName: 'failing-model',
    async generateText() {
      throw new Error('Rate limit exceeded: 429 Too Many Requests');
    },
    async *streamText() {
      yield { type: 'error', error: 'Stream failed' };
    },
  };

  const testAgent = agent({
    name: 'resilient-agent',
    model: failingModel,
    observability: {
      onStepStart: (step) => recordedSteps.push(step),
      onError: (err) => {
        capturedError = err;
      },
    },
  });

  await assert.rejects(
    async () => {
      await testAgent.run('Hello');
    },
    {
      message: 'Rate limit exceeded: 429 Too Many Requests',
    }
  );

  assert.ok(capturedError !== null, 'observability.onError was not called');
  assert.equal(capturedError.message, 'Rate limit exceeded: 429 Too Many Requests');
  assert.deepEqual(recordedSteps, [1]);
});

test('Issue #109: Agent.run() successful execution does not trigger onError', async () => {
  let capturedError = null;

  const successModel = {
    provider: 'mock',
    modelName: 'success-model',
    async generateText() {
      return {
        text: 'All systems operational.',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    },
    async *streamText() {
      yield { type: 'text-delta', textDelta: 'All systems operational.' };
      yield { type: 'done' };
    },
  };

  const testAgent = agent({
    name: 'success-agent',
    model: successModel,
    observability: {
      onError: (err) => {
        capturedError = err;
      },
    },
  });

  const result = await testAgent.run('Ping');
  assert.equal(result.text, 'All systems operational.');
  assert.equal(capturedError, null);
});

test('Issue #84: useAgent triggers onError and skips onFinish on SSE error chunk', async () => {
  stateIndex = 0;
  mockReactState.clear();

  let finishedMessage = null;
  let receivedError = null;

  const mockSseStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"type":"text-delta","textDelta":"Thinking..."}\n\n'));
      controller.enqueue(
        encoder.encode('data: {"type":"error","error":"Model inference failed: context length exceeded"}\n\n')
      );
      controller.close();
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(mockSseStream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    const hook = useAgent({
      api: '/api/test-agent',
      onFinish: (msg) => {
        finishedMessage = msg;
      },
      onError: (err) => {
        receivedError = err;
      },
    });

    await hook.handleSubmit(null, { prompt: 'Explain quantum computing' });

    assert.equal(finishedMessage, null, 'onFinish should not be called when stream encounters an error');
    assert.ok(receivedError !== null, 'onError should have been called');
    assert.equal(receivedError.message, 'Model inference failed: context length exceeded');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Issue #84: useAgent successfully calls onFinish for valid non-error SSE stream', async () => {
  stateIndex = 0;
  mockReactState.clear();

  let finishedMessage = null;
  let receivedError = null;

  const mockSseStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"type":"text-delta","textDelta":"Hello "}\n\n'));
      controller.enqueue(encoder.encode('data: {invalid-json\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"text-delta","textDelta":"World!"}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(mockSseStream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    const hook = useAgent({
      api: '/api/test-agent',
      onFinish: (msg) => {
        finishedMessage = msg;
      },
      onError: (err) => {
        receivedError = err;
      },
    });

    await hook.handleSubmit(null, { prompt: 'Say hello' });

    assert.equal(receivedError, null, 'onError should not be called on valid stream');
    assert.ok(finishedMessage !== null, 'onFinish should be called on valid stream completion');
    assert.equal(finishedMessage.content, 'Hello World!');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
