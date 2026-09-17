import assert from 'node:assert/strict';
import test from 'node:test';

import { agent, tool, createMockModel } from '../../src/ai';

test('agent runs simple text prompt and generates response', async () => {
  const assistant = agent({
    name: 'greeter',
    model: createMockModel({
      defaultResponse: 'Welcome to Vista.js AI!',
    }),
    systemPrompt: 'You are a polite assistant.',
  });

  const result = await assistant.run('Hello');
  assert.equal(result.text, 'Welcome to Vista.js AI!');
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.steps.length, 1);
  assert.ok(result.usage.totalTokens > 0);
});

test('agent executes multi-step tool reasoning loop', async () => {
  let toolCalledWith = '';

  const weatherTool = tool({
    name: 'get_weather',
    description: 'Get weather for city',
    execute: async ({ city }: { city: string }) => {
      toolCalledWith = city;
      return { temp: 72, condition: 'Sunny in ' + city };
    },
  });

  // Create a model that issues a tool call on step 1, then returns final text on step 2
  let step = 0;
  const multiStepModel = {
    provider: 'mock',
    modelName: 'test-multistep',
    async generateText(options: any) {
      step++;
      if (step === 1) {
        return {
          text: '',
          toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: { city: 'San Francisco' } }],
          finishReason: 'tool-calls',
        };
      }
      return {
        text: 'The weather in San Francisco is 72 degrees and sunny.',
        finishReason: 'stop',
      };
    },
    async *streamText(options: any) {
      yield { type: 'text-delta', textDelta: 'The weather is sunny.' };
      yield { type: 'done' };
    },
  };

  const weatherAgent = agent({
    name: 'weather-agent',
    model: multiStepModel as any,
    tools: [weatherTool],
  });

  const result = await weatherAgent.run('How is the weather in SF?');
  assert.equal(toolCalledWith, 'San Francisco');
  assert.equal(result.text, 'The weather in San Francisco is 72 degrees and sunny.');
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].toolCalls?.length, 1);
  assert.equal(result.steps[0].toolResults?.length, 1);
});

test('agent as tool enables multi-agent hierarchical collaboration', async () => {
  const researcher = agent({
    name: 'researcher',
    model: createMockModel({
      defaultResponse: 'Vista is a next-generation full-stack React framework.',
    }),
  });

  const researcherTool = researcher.asTool();
  assert.equal(researcherTool.name, 'ask_researcher');

  const answer = await researcherTool.execute({ query: 'What is Vista?' });
  assert.equal(answer, 'Vista is a next-generation full-stack React framework.');
});

test('agent stream yields real-time chunks and produces valid SSE response', async () => {
  const bot = agent({
    name: 'stream-bot',
    model: createMockModel({
      defaultResponse: 'Streaming is fast and interactive.',
    }),
  });

  const stream = bot.stream('Tell me about streaming');
  const response = stream.toDataStreamResponse();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');

  // Read response text
  const text = await response.text();
  assert.match(text, /data: {"type":"text-delta"/);
  assert.match(text, /data: \[DONE\]/);
});
