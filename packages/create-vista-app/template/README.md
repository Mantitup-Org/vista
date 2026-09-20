# My Vista App

Built with [Vista.js](https://github.com/Mantitup-Org/vista).

Selected engine: `__VISTA_ENGINE__` · Typed API starter: `__VISTA_TYPED_API__`

## Run

```bash
npm run dev
```

Open [http://localhost:3003](http://localhost:3003).

## What can you build?

| Goal | How |
| --- | --- |
| Normal React UI | Add pages under `app/`. Use `'use client'` for interactive components. |
| Fullstack APIs | Add `app/api/**/route.ts`, or run `vista g api-init` for typed procedures. |
| Auth | `vista g auth` then set `AUTH_SECRET`. Opens `/signin` (POST credentials + OAuth) and gates `/account`. |
| AI chat agent | `vista g agent support` → edit `app/agents/support/agent.ts`. |
| RAG over your docs | Use `InMemoryVectorStore` + `createRetrieverTool` + optional `embedText` from `vista/ai`. |

## Project structure

```
app/
├── root.tsx        # Root layout
├── index.tsx       # Home → /
├── globals.css
└── about/page.tsx  # → /about
public/
vista.config.ts
```

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build (`.vista/`), serve |
| `vista g api-init` | Typed API starter |
| `vista g auth` | Auth config, `/signin`, `/account`, middleware, SessionProvider |
| `vista g agent <name>` | Agent + streaming route + `app/AGENTS.md` |
| `npm run deploy` | Deploy helpers (Render, Vercel, Cloudflare, …) |

## Models (AI)

Set `VISTA_AI_MODEL`, for example:

- `openai:gpt-4o` · `groq:llama-3.1-8b-instant` · `nvidia:meta/llama-3.1-8b-instruct` · `ollama:llama3`

## Learn more

- [React app guide](https://vistajs.pages.dev/docs/getting-started/react-app)
- [Fullstack guide](https://vistajs.pages.dev/docs/getting-started/fullstack-app)
- [AI overview](https://vistajs.pages.dev/docs/ai/overview)
- [RAG guide](https://vistajs.pages.dev/docs/ai/rag)
- [GitHub](https://github.com/Mantitup-Org/vista)
