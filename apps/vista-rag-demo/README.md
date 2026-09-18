# Vista RAG demo

End-to-end example of **retrieval-augmented generation** on Vista: knowledge docs → retriever tool → agent → streaming chat UI.

No API key is required for the default demo. It uses keyword search in an in-memory store plus a mock model that always calls the retriever. Swap in a real model and embeddings when you want production-style RAG.

## Run it

From the monorepo root:

```bash
pnpm --filter vista-rag-demo dev
```

Or:

```bash
cd apps/vista-rag-demo
npm run dev
```

Open the URL printed in the terminal (typically `http://localhost:3003`).

## What you are looking at

| Piece | Path | Role |
| --- | --- | --- |
| Knowledge docs | `lib/rag-knowledge.ts` | Text chunks the agent can retrieve |
| Agent + retriever | `lib/rag-agent.ts` | `InMemoryVectorStore` + `createRetrieverTool` + `agent()` |
| API | `app/api/rag-chat/route.ts` | Streams agent output as SSE |
| UI | chat page under `app/` | `useAgent` against `/api/rag-chat` |

## How RAG works here

1. Documents are loaded into `InMemoryVectorStore`.
2. `createRetrieverTool` exposes them as a tool named like `search_knowledge_base`.
3. On each user question the agent calls that tool.
4. The model answers from the returned chunks (demo model formats them as a grounded reply).

Keyword mode (default): omit `embed` on the retriever.

Embedding mode (optional):

```ts
import { embedText, createRetrieverTool } from 'vista/ai';

const search = createRetrieverTool({
  store,
  embed: (query) => embedText(query, { model: 'openai:text-embedding-3-small' }),
  topK: 3,
});
```

Set `OPENAI_API_KEY` (or NVIDIA / Ollama embed endpoints) and change the agent `model` to e.g. `groq:llama-3.1-8b-instant` with `GROQ_API_KEY`.

## Learn more

- Framework guide: [RAG with Vista AI](https://vista-js.vercel.app/docs/ai/rag)
- Root README paths: React / fullstack / AI / RAG
- `vista g agent <name>` scaffolds agents in any Vista app
