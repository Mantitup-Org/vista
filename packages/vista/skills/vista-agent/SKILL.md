---
name: vista-agent
description: >
  Add a Vista AI agent, tool, and streaming chat route. Use when the user
  asks for a chat agent, tool calling, `vista g agent`, `useAgent`, or
  `vista/ai`. Do not install a third-party agent SDK.
---

# Add a Vista agent

Read `docs/ai.md` in this package before editing.

## Steps

1. From the app root, run `vista g agent <name>`. The name is kebab-case. This writes:
   - `app/agents/<name>/agent.ts`
   - `app/api/agents/<name>/route.ts`
   - `app/AGENTS.md` when that file is missing
2. Edit the generated agent. Keep `import { agent, tool } from 'vista/ai'`. Set `model` to `process.env.VISTA_AI_MODEL` or an explicit `provider:model` string from `docs/ai.md`. Put real tools in `tools`. Leave `memory: true` unless the user asked for a stateless agent.
3. Keep the generated `POST` handler. It must call `<name>Agent.stream({ prompt, messages, sessionId })` and `return stream.toDataStreamResponse()`.
4. Add a client page with `'use client'` and `useAgent({ api: '/api/agents/<name>' })` from `vista/ai/react`.
5. Do not commit API keys. Tell the user which env var the chosen provider needs (`OPENAI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `NVIDIA_API_KEY`).
6. Verify with the `vista-dev-loop` skill: `POST /api/agents/<name>` with a JSON body `{ "prompt": "ping" }` and confirm the terminal shows the request rather than a compile error.

## Do not

- Import from `@vistagenic/vista/ai` inside an app. Apps use `vista/ai`.
- Create `app/page.tsx` or `app/layout.tsx`. Home is `app/index.tsx`. The root layout is `app/root.tsx`.
