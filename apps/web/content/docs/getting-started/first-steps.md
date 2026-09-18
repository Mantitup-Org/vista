---
category: "getting-started"
slug: "first-steps"
title: "First Steps"
summary: "Bootstrap a Vista app, then pick React-only, fullstack, AI, or RAG depending on what you are building."
order: 1
updatedAt: "2026-09-18"
---

## Create an app

```bash title="Terminal"
npx create-vista-app@latest my-vista-app
cd my-vista-app
npm run dev
```

Open `http://localhost:3003`.

## Pick a path

| Goal | Guide |
| --- | --- |
| Pages, layouts, client UI only | [Build a React App](/docs/getting-started/react-app) |
| APIs, typed procedures, auth, middleware | [Build a Fullstack App](/docs/getting-started/fullstack-app) |
| Chat agents, tools, streaming | [AI Overview](/docs/ai/overview) |
| Answers grounded in your docs | [RAG](/docs/ai/rag) |

## Project shape

- `app/` — routes and layouts
- `components/` — reusable UI
- `lib/` — helpers
- `app/api/` — HTTP APIs and typed API entry
- `app/agents/` — runtime AI agents (optional)
- `auth.ts` / `middleware.ts` / `/signin` — after `vista g auth`

## Tiny API smoke test

```ts title="app/api/health/route.ts"
export async function GET() {
  return Response.json({
    ok: true,
    framework: 'vista',
    timestamp: Date.now(),
  });
}
```

Visit `/api/health` while `npm run dev` is running.

## Continue
- [Build a React App](/docs/getting-started/react-app)
- [Build a Fullstack App](/docs/getting-started/fullstack-app)
- [Project Structure](/docs/getting-started/project-structure)
- [Typed API Quickstart](/docs/getting-started/typed-api-quickstart)
