# AGENTS.md

Guidance for coding agents working in this Vista repository. Runtime AI agents that ship inside apps live under `app/agents/` — see that convention below.

## Repo map

- `packages/vista` — framework, CLI (`vista`), RSC/SSR runtime, `vista/auth`, `vista/ai`, `vista/stack`
- `packages/create-vista-app` — app scaffold
- `apps/web` — docs site at vista.xyz
- `crates/` and `flashpack/` — Rust engines
- Build output is `.vista/` (Next's `.next` equivalent). Do not commit app `.vista/` folders.

## Commands

```bash
pnpm install
npm --prefix packages/vista run build
pnpm test:integrity
```

Narrow tests live as `pnpm test:<name>` in the root `package.json`. After changing `packages/vista/src`, rebuild `packages/vista/dist` (that folder is committed).

## Conventions

- App runtime agents: `vista g agent <name>` → `app/agents/<name>/agent.ts` + `app/api/agents/<name>/route.ts` + `app/AGENTS.md`
- Auth: `vista g auth` → `auth.ts` + `app/api/auth/[...vista]/route.ts`. Import from `vista/auth` (server) and `vista/auth/react` (client).
- Typed API: `vista g api-init`. Call procedures from RSC with `v.createCaller(router, { ctx, env })`.
- Package imports in generated apps use `vista/...`. Inside this monorepo, published name is `@vistagenic/vista`.

## Models and embeddings

Model strings are `provider:model`:

- `openai:gpt-4o`, `anthropic:claude-3-5-sonnet`, `gemini:gemini-1.5-flash`, `ollama:llama3`
- `groq:llama-3.1-8b-instant` (`GROQ_API_KEY`)
- `nvidia:meta/llama-3.1-8b-instruct` (`NVIDIA_API_KEY` or `NIM_API_KEY`)
- `mock:echo` for tests

```ts
import { embedText, createRetrieverTool } from 'vista/ai';
```

Do not commit API keys or `.env` files.

## Git

Keep commit messages free of editor-injected trailers. Dist files under `packages/vista/dist` must match `src`.
