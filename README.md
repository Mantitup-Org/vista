# Vista.js

Vista.js is a React 19 framework for building apps the way you already think about Next.js: file-based routes under `app/`, React Server Components by default, and one CLI for `dev` / `build` / `start`.

Official site: https://vista-js.vercel.app · Repo: https://github.com/Mantitup-Org/vista

## Which guide do you need?

| I want to… | Read this |
| --- | --- |
| Build a normal React site (pages, layouts, client UI) | [1. React app](#1-build-a-normal-react-app) |
| Add APIs, typed procedures, auth, middleware | [2. Fullstack app](#2-build-a-fullstack-app) |
| Chat with an LLM / tools / streaming UI | [3. AI agents](#3-use-ai-agents) |
| Ground answers in my own docs (RAG) | [4. RAG](#4-use-rag-retrieval-augmented-generation) |

Docs site mirrors these paths:

- [React app](https://vista-js.vercel.app/docs/getting-started/react-app)
- [Fullstack app](https://vista-js.vercel.app/docs/getting-started/fullstack-app)
- [AI overview](https://vista-js.vercel.app/docs/ai/overview)
- [RAG](https://vista-js.vercel.app/docs/ai/rag)

---

## Quick start

```bash
npx create-vista-app@latest my-app
cd my-app
npm run dev
```

Open http://localhost:3003. Same scripts on every engine:

```bash
npm run dev      # develop
npm run build    # production build → .vista/
npm run start    # serve production
```

Optional flags:

```bash
npx create-vista-app@latest my-app --engine flashpack   # Rust-backed engine
npx create-vista-app@latest my-app --typed-api          # scaffold typed API files
```

Package name in apps: `vista/...`. In this monorepo the published name is `@vistagenic/vista`.

---

## 1. Build a normal React app

Vista apps are React apps. Folders under `app/` are routes. Components are **Server Components** by default (less JS in the browser). Mark interactive pieces with `'use client'`.

```
my-app/
├── app/
│   ├── root.tsx          # <html>, <body>, fonts, shared layout
│   ├── index.tsx         # home page → /
│   ├── about/page.tsx    # → /about
│   └── globals.css
├── components/           # shared UI
├── public/
└── vista.config.ts
```

**Page (Server Component):**

```tsx
// app/about/page.tsx
export default function AboutPage() {
  return <h1>About</h1>;
}
```

**Interactive UI (Client Component):**

```tsx
// components/counter.tsx
'use client';

import { useState } from 'react';

export function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}
```

**Theme / fonts / links** (same mental model as Next):

```tsx
import { ThemeProvider, ThemeScript } from 'vista/theme';
import Link from 'vista/link';
```

That is enough for marketing sites, dashboards UI shells, and content apps. No API required.

---

## 2. Build a fullstack app

Add a backend **in the same repo**. Three layers you can mix:

### A. File-based API routes (`route.ts`)

Any `app/**/route.ts` is an HTTP endpoint:

```ts
// app/api/users/route.ts
export async function GET() {
  return Response.json({ users: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ ok: true, body }, { status: 201 });
}
```

Dynamic params work like pages: `app/api/users/[id]/route.ts` → `/api/users/42`.

### B. Typed API (`vista/stack`) — end-to-end types

```bash
vista g api-init
```

```ts
// app/api/typed.ts
import { vstack } from 'vista/stack';
import { createRootRouter } from './routers';

const v = vstack.init();
export const router = createRootRouter(v);
```

Call from a Server Component **without HTTP**:

```ts
import { vstack } from 'vista/stack';
import { router } from '@/app/api/typed';

const v = vstack.init();
const caller = v.createCaller(router, { ctx: {}, env: {} });
const health = await caller.health();
```

Or from the browser with `createVistaClient` from `vista/stack/client`.

### C. Auth + middleware

```bash
vista g auth
```

```ts
import VistaAuth, { GitHub, Credentials } from 'vista/auth';

export const { handlers, auth, authMiddleware } = VistaAuth({
  providers: [GitHub({}), Credentials({ authorize: async () => null })],
});
```

```ts
// middleware.ts
import { NextResponse } from 'vista/server';

export async function middleware({ request, next }) {
  if (request.nextUrl.pathname.startsWith('/admin') && !request.cookies.get('vista.session-token')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return next();
}
```

Set `AUTH_SECRET` in the environment before using credentials/OAuth.

---

## 3. Use AI agents

Agents live next to your UI. Generate one:

```bash
vista g agent support
```

Creates:

- `app/agents/support/agent.ts`
- `app/api/agents/support/route.ts`
- `app/AGENTS.md` (app-level convention notes)

**Define the agent:**

```ts
import { agent, tool } from 'vista/ai';

export const supportAgent = agent({
  name: 'support',
  model: process.env.VISTA_AI_MODEL || 'openai:gpt-4o',
  systemPrompt: 'You are a helpful support agent.',
  tools: [
    tool({
      name: 'ping',
      description: 'Health check',
      execute: async () => ({ ok: true }),
    }),
  ],
  memory: true,
});
```

**Stream from a route:**

```ts
import { supportAgent } from '../../agents/support/agent';

export async function POST(req: Request) {
  const { prompt, messages, sessionId } = await req.json();
  return supportAgent.stream({ prompt, messages, sessionId }).toDataStreamResponse();
}
```

**Consume in React:**

```tsx
'use client';
import { useAgent } from 'vista/ai/react';

export function Chat() {
  const { messages, input, setInput, handleSubmit, isLoading } = useAgent({
    api: '/api/agents/support',
  });
  // render messages + form…
}
```

### Model strings (`provider:model`)

| Provider | Example | Env |
| --- | --- | --- |
| OpenAI | `openai:gpt-4o` | `OPENAI_API_KEY` |
| Anthropic | `anthropic:claude-3-5-sonnet` | `ANTHROPIC_API_KEY` |
| Gemini | `gemini:gemini-1.5-flash` | `GEMINI_API_KEY` |
| Ollama | `ollama:llama3` | local Ollama |
| Groq | `groq:llama-3.1-8b-instant` | `GROQ_API_KEY` |
| NVIDIA NIM | `nvidia:meta/llama-3.1-8b-instruct` | `NVIDIA_API_KEY` or `NIM_API_KEY` |
| Tests | `mock:echo` | none |

Override the default with `VISTA_AI_MODEL=groq:llama-3.1-8b-instant`.

---

## 4. Use RAG (retrieval-augmented generation)

RAG = store your docs as vectors (or keywords) → retrieve the best chunks → give them to the agent as a tool.

```ts
import {
  agent,
  InMemoryVectorStore,
  createRetrieverTool,
  embedText,
} from 'vista/ai';

const store = new InMemoryVectorStore();

// Index once (startup or build script)
store.addDocument({
  id: 'intro',
  text: 'Vista is a React framework with App Router and RSC.',
  vector: await embedText('Vista is a React framework with App Router and RSC.', {
    model: 'openai:text-embedding-3-small',
  }),
});

const search = createRetrieverTool({
  store,
  embed: (query) =>
    embedText(query, { model: 'openai:text-embedding-3-small' }),
  topK: 3,
});

export const docsAgent = agent({
  name: 'docs',
  model: 'groq:llama-3.1-8b-instant',
  systemPrompt: 'Answer only from search_knowledge_base results.',
  tools: [search],
  memory: true,
});
```

No embedding API yet? Omit `embed` — the retriever falls back to keyword search (what [`apps/vista-rag-demo`](apps/vista-rag-demo) does out of the box, no API key required).

Run the demo:

```bash
pnpm --filter vista-rag-demo dev
# or: cd apps/vista-rag-demo && npm run dev
```

---

## Packages

| Package | Purpose |
| --- | --- |
| `@vistagenic/vista` | Framework runtime, CLI, RSC/SSR, auth, AI, stack |
| `create-vista-app` | Scaffold new apps |
| `vista-native` | Internal Rust/NAPI bridge |

## Engines

- **default** — webpack-backed RSC/SSR (output in `.vista/`)
- **flashpack** — Rust-backed path (runtime state in `.flash/`)

Pick at scaffold time or set `engine.variant` in `vista.config.ts`. Commands stay the same.

## Local monorepo development

```bash
pnpm install
npm --prefix packages/vista run build
pnpm test:integrity
```

After editing `packages/vista/src`, rebuild `packages/vista/dist` (committed).

## Learn more

- Docs: https://vista-js.vercel.app/docs/getting-started/first-steps
- [CONTRIBUTING.md](CONTRIBUTING.md) · [developer.md](developer.md) · [AGENTS.md](AGENTS.md)
- Contribution / CI notes for maintainers stay in those files; app authors start with the four paths above.
