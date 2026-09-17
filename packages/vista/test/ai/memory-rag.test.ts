import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryStore,
  InMemoryVectorStore,
  createRetrieverTool,
  cosineSimilarity,
} from '../../src/ai';

test('InMemoryStore persists and recalls conversation session messages', async () => {
  const store = new InMemoryStore({ maxMessages: 5 });

  await store.save('session-1', [
    { role: 'user', content: 'Message 1' },
    { role: 'assistant', content: 'Reply 1' },
  ]);

  const history1 = await store.get('session-1');
  assert.equal(history1.length, 2);
  assert.equal(history1[0].content, 'Message 1');

  // Distinct sessions
  const history2 = await store.get('session-2');
  assert.equal(history2.length, 0);

  // Clear
  await store.clear('session-1');
  const cleared = await store.get('session-1');
  assert.equal(cleared.length, 0);
});

test('cosineSimilarity computes exact vector angle distances', () => {
  const v1 = [1, 0, 0];
  const v2 = [1, 0, 0];
  const v3 = [0, 1, 0];

  assert.equal(cosineSimilarity(v1, v2), 1);
  assert.equal(cosineSimilarity(v1, v3), 0);
});

test('InMemoryVectorStore and retriever tool find relevant knowledge', async () => {
  const store = new InMemoryVectorStore();
  store.addDocuments([
    {
      id: 'doc-1',
      text: 'Vista.js supports React Server Components and Server Actions out of the box.',
      vector: [0.9, 0.1, 0.1],
    },
    {
      id: 'doc-2',
      text: 'Deployment support is automated for Vercel, Cloudflare, Render, and Docker.',
      vector: [0.1, 0.9, 0.1],
    },
    {
      id: 'doc-3',
      text: 'The AI framework provides native agent and tool execution primitives.',
      vector: [0.1, 0.1, 0.9],
    },
  ]);

  // Search by vector
  const vectorResults = store.search([0.9, 0.05, 0.05], 1);
  assert.equal(vectorResults.length, 1);
  assert.equal(vectorResults[0].id, 'doc-1');

  // Search by keyword fallback
  const keywordResults = store.searchByKeyword('deployment render', 1);
  assert.equal(keywordResults.length, 1);
  assert.equal(keywordResults[0].id, 'doc-2');

  // Retriever tool
  const retriever = createRetrieverTool({
    store,
    topK: 2,
  });

  const toolOutput = await retriever.execute({ query: 'React Server Components' });
  assert.ok(Array.isArray(toolOutput));
  assert.equal(toolOutput.length >= 1, true);
  assert.match(toolOutput[0].content, /Vista\.js supports React Server Components/);
});
