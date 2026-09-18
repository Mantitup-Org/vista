---
category: "introduction"
slug: "architecture-of-simplicity"
title: "The Architecture of Simplicity"
summary: "Under the hood Vista is optimized for fast iteration, server rendering, and predictable routing behavior."
order: 2
updatedAt: "2026-09-18"
---

## Server-First by Default

When a request comes in, Vista renders your React tree as a stream and starts sending UI early instead of waiting for a full HTML string.

## Routing Model

File-system routes, nested layouts, and catch-all segments are built in so application structure stays predictable.

## Four product paths

- **React app** — pages and layouts under `app/`.
- **Fullstack** — `route.ts`, typed procedures, `vista g auth`, `middleware.ts`.
- **AI** — `vista g agent` plus `vista/ai`.
- **RAG** — `InMemoryVectorStore`, `createRetrieverTool`, `embedText`.

You add those folders in the same project. You do not start a second Node server.

## DX Philosophy

> Power should feel obvious, not hidden behind ceremony.

## Related
- [Routing Overview](/docs/core-concepts/routing-overview)
