---
name: vista-rag
description: >
  Ground a Vista agent with retrieval. Use when the user asks for RAG,
  document search, embeddings, `InMemoryVectorStore`, `createRetrieverTool`,
  or `embedText`. Keyword search needs no API key. Embeddings are optional.
---

# Add RAG to a Vista agent

Read `docs/rag.md` in this package before editing.

## Steps

1. Run `vista g agent <name>` if the agent does not exist yet. Follow `vista-agent` for the route and the client page.
2. Add a module such as `lib/rag.ts` that creates an `InMemoryVectorStore`, calls `addDocuments` (or `addDocument` when storing vectors), and exports a `createRetrieverTool`.
3. Start with keyword search: omit `embed`. Use `model: 'mock:echo'` only for a smoke test. For a real answer, set `provider:model` and the matching API key.
4. Pass that tool on the agent's `tools` array. The system prompt must tell the model to answer from the retriever results and to say when nothing matches.
5. Add embeddings only when the user asks for semantic search. Use `embedText` from `vista/ai` with an OpenAI-compatible embedding model, store `vector` on each document, and pass the same function as `createRetrieverTool`'s `embed`.
6. Verify with `vista-dev-loop`. `POST` a question whose answer is in the indexed text and confirm the route responds. Do not claim the model cited a chunk unless the response includes it.

## Imports

```ts
import { agent, InMemoryVectorStore, createRetrieverTool, embedText } from 'vista/ai';
```
