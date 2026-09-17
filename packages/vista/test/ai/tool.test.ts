import assert from 'node:assert/strict';
import test from 'node:test';

import {
  tool,
  formatToolForOpenAI,
  formatToolForAnthropic,
  formatToolForGemini,
} from '../../src/ai';

test('tool helper validates inputs and executes tool function', async () => {
  assert.throws(() => tool({} as any), /Tool must have a valid string name/);
  assert.throws(() => tool({ name: 'test' } as any), /Tool "test" must have a description/);
  assert.throws(
    () => tool({ name: 'test', description: 'desc' } as any),
    /Tool "test" must have an execute function/
  );

  const calculator = tool({
    name: 'add',
    description: 'Add two numbers together',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      required: ['a', 'b'],
    },
    execute: async ({ a, b }: { a: number; b: number }) => {
      return a + b;
    },
  });

  const result = await calculator.execute({ a: 10, b: 32 });
  assert.equal(result, 42);
});

test('tool formatters generate proper specifications for providers', () => {
  const sampleTool = tool({
    name: 'lookup_user',
    description: 'Look up user by ID',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    execute: () => ({}),
  });

  const openAISpec = formatToolForOpenAI(sampleTool);
  assert.equal(openAISpec.type, 'function');
  assert.equal(openAISpec.function.name, 'lookup_user');
  assert.deepEqual(openAISpec.function.parameters, sampleTool.parameters);

  const anthropicSpec = formatToolForAnthropic(sampleTool);
  assert.equal(anthropicSpec.name, 'lookup_user');
  assert.deepEqual(anthropicSpec.input_schema, sampleTool.parameters);

  const geminiSpec = formatToolForGemini(sampleTool);
  assert.equal(geminiSpec.name, 'lookup_user');
  assert.deepEqual(geminiSpec.parameters, sampleTool.parameters);
});
