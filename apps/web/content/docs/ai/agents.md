---
category: "ai"
slug: "agents"
title: "AI Agents"
summary: "First-class agents, tools, streaming, and memory inside a Vista app."
order: 1
updatedAt: "2026-09-05"
---

## Install surface

```ts title="app/agents/support/agent.ts"
import { agent, tool } from 'vista/ai';

const searchDocs = tool({
  name: 'searchDocs',
  description: 'Search product docs',
  async execute({ query }: { query: string }) {
    return { query, hits: [] };
  },
});

export const supportAgent = agent({
  name: 'support',
  model: 'openai:gpt-4o-mini',
  instructions: 'Answer with short, sourced help text.',
  tools: [searchDocs],
  memory: true,
});
```

Drop that file under `app/agents/<name>/agent.ts`. Vista registers it automatically and serves:

- `GET /api/agents`
- `GET /api/agents/support`
- `POST /api/agents/support` with `{ input, sessionId?, stream? }`

Streaming uses `text/event-stream`.

## Providers

Model strings use `provider:model`:

- `openai:gpt-4o-mini`
- `anthropic:claude-3-5-sonnet`
- `google:gemini-1.5-pro`
- `qwen:qwen-plus`
- `local:llama3` (OpenAI-compatible, defaults to Ollama at `http://127.0.0.1:11434/v1`)

Or pass a custom provider from `openaiCompatible()`, `mockProvider()`, or your own `ModelProvider`.

## UI + API coexistence

Agents live next to `app/page.tsx` and `app/api/*/route.ts`. They are server-only. Do not import `vista/ai` from Client Components.
