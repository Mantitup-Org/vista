#!/usr/bin/env node

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { createAnthropicModel } = require('../../dist/ai/providers/anthropic.js');
const { Agent } = require('../../dist/ai/agent.js');

test('Anthropic streaming provider accumulates and emits tool_use blocks', async () => {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_fixture',
        type: 'message',
        role: 'assistant',
        model: 'fixture',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'toolu_fixture',
        name: 'get_weather',
        input: {},
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"city":',
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '"Seoul"}',
      },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 20 },
    },
    { type: 'message_stop' },
  ];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      events.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''),
      { headers: { 'Content-Type': 'text/event-stream' } }
    );

  try {
    const model = createAnthropicModel({
      model: 'fixture',
      apiKey: 'test-only',
      baseURL: 'https://example.invalid/v1',
    });

    const executed = [];
    const localTool = {
      name: 'get_weather',
      description: 'Local test fixture',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
      execute(args) {
        executed.push(args);
        return 'Sunny';
      },
    };

    const agent = new Agent({
      name: 'fixture',
      model,
      tools: [localTool],
      maxSteps: 1,
    });

    const agentEvents = [];
    for await (const e of agent.stream('Weather in Seoul?')) {
      agentEvents.push(e);
    }

    assert.deepEqual(executed, [{ city: 'Seoul' }]);
    const hasToolCall = agentEvents.some((e) => e.type === 'tool-call');
    assert.ok(hasToolCall, 'Stream should include tool-call event');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
