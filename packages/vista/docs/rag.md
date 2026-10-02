# RAG

Index documents, retrieve matches, and pass them to an agent as a tool. Imports:

```ts
import { agent, InMemoryVectorStore, createRetrieverTool, embedText } from 'vista/ai';
```

## Keyword search

Omit `embed`. The retriever uses keyword search and needs no API key. `mock:echo` is enough for a smoke test.

```ts
const store = new InMemoryVectorStore();
store.addDocuments([
  { id: 'rsc', text: 'Vista uses React Server Components by default under app/.' },
]);

const search = createRetrieverTool({
  name: 'search_knowledge_base',
  description: 'Search the product knowledge base',
  store,
  topK: 3,
});

export const ragAgent = agent({
  name: 'rag',
  model: 'mock:echo',
  systemPrompt: 'Answer using search_knowledge_base results only.',
  tools: [search],
  memory: true,
});
```

## Embeddings

`embedText` calls an OpenAI-compatible `/embeddings` endpoint. Set the provider key. Pass the same embedder to the store and the tool.

```ts
const text = 'Vista builds into .vista/, similar to Next.js .next/.';
store.addDocument({
  id: 'build',
  text,
  vector: await embedText(text, { model: 'openai:text-embedding-3-small' }),
});

const search = createRetrieverTool({
  store,
  embed: (query) => embedText(query, { model: 'openai:text-embedding-3-small' }),
  topK: 3,
});
```

Stream the agent from `app/api/agents/<name>/route.ts` and render it with `useAgent` from `vista/ai/react`. A runnable demo lives in the Vista repo at `apps/vista-rag-demo`.
