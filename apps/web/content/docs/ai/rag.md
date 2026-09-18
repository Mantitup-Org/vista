---
category: "ai"
slug: "rag"
title: "RAG with Vista AI"
summary: "Index your documents, retrieve the best chunks, and answer with an agent tool — with or without an embedding API."
order: 5
updatedAt: "2026-09-18"
---

RAG (retrieval-augmented generation) means: store knowledge → search it for each question → pass matches into the model so answers stay grounded.

Vista ships this as `InMemoryVectorStore`, `createRetrieverTool`, and optional `embedText`.

## Minimal flow

1. Put documents in a vector store.
2. Attach a retriever tool to an agent.
3. Stream the agent from `app/api/.../route.ts`.
4. Chat from the UI with `useAgent`.

## Keyword RAG (no API key)

Useful for demos and local smoke tests. Omit `embed` and the tool uses keyword search.

```ts title="lib/rag.ts"
import { agent, InMemoryVectorStore, createRetrieverTool } from 'vista/ai';

const store = new InMemoryVectorStore();
store.addDocuments([
  {
    id: 'rsc',
    text: 'Vista uses React Server Components by default under app/.',
  },
  {
    id: 'routes',
    text: 'File-based APIs live in app/**/route.ts.',
  },
]);

const search = createRetrieverTool({
  name: 'search_knowledge_base',
  description: 'Search the product knowledge base',
  store,
  topK: 3,
});

export const ragAgent = agent({
  name: 'rag',
  model: 'mock:echo', // swap for groq: / openai: / nvidia: in production
  systemPrompt: 'Answer using search_knowledge_base results only.',
  tools: [search],
  memory: true,
});
```

Runnable example: [`apps/vista-rag-demo`](https://github.com/Mantitup-Org/vista/tree/main/apps/vista-rag-demo).

## Embedding RAG (real vectors)

```ts
import { embedText, InMemoryVectorStore, createRetrieverTool, agent } from 'vista/ai';

const store = new InMemoryVectorStore();
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

export const ragAgent = agent({
  name: 'rag',
  model: process.env.VISTA_AI_MODEL || 'groq:llama-3.1-8b-instant',
  systemPrompt: 'Cite retrieved chunks. If nothing matches, say so.',
  tools: [search],
  memory: true,
});
```

`embedText` / `embedTexts` talk to OpenAI-compatible `/embeddings` endpoints (OpenAI, NVIDIA NIM, Ollama, etc.). Set the matching API key.

## Wire the route and UI

```bash
vista g agent docs
```

Then point the generated agent at your retriever tool, keep the streaming route, and use:

```tsx
'use client';
import { useAgent } from 'vista/ai/react';

export function RagChat() {
  const chat = useAgent({ api: '/api/agents/docs' });
  // render chat.messages + form with chat.handleSubmit
}
```

## Tips

- Index once at startup or in a build script; do not re-embed on every request.
- Keep `systemPrompt` strict: “only answer from tool results”.
- Start with keyword RAG to validate the agent loop, then add embeddings.
- Prefer small `topK` (2–5) so the model stays focused.

## Related
- [AI Overview](/docs/ai/overview)
- [Agents and Tools](/docs/ai/agents)
- [Model Providers](/docs/ai/providers)
- [Streaming and UI Hooks](/docs/ai/streaming)
