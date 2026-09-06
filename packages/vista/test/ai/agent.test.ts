import assert from 'node:assert/strict';
import test from 'node:test';

import { agent, mockProvider, tool } from '../../src/ai';

test('agent generate uses tools and mock provider', async () => {
  const support = agent({
    name: 'support',
    model: mockProvider((request) => {
      if (request.messages.some((message) => message.role === 'tool')) {
        return {
          text: 'done',
          toolCalls: [],
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      }
      return {
        text: '',
        toolCalls: [{ id: '1', name: 'searchDocs', arguments: { query: 'vista' } }],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    }),
    tools: [
      tool({
        name: 'searchDocs',
        description: 'Search',
        execute: async () => ({ hits: 1 }),
      }),
    ],
  });

  const result = await support.generate('hello');
  assert.equal(result.text, 'done');
  assert.equal(result.toolCalls[0]?.name, 'searchDocs');
});
