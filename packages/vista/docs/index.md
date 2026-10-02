# Vista docs for agents

These files ship with the installed `vista` package and match that version. Read the guide that fits the task before writing code. Do not invent Next.js App Router APIs, `app/page.tsx` as the home route, or `app/layout.tsx`.

| Guide | Use it for |
| --- | --- |
| [app.md](app.md) | Routes, layouts, client components, `vista.config.ts`, build output |
| [cli.md](cli.md) | `create-vista-app` and `vista g` generators |
| [ai.md](ai.md) | Agents, tools, streaming, model strings |
| [rag.md](rag.md) | `InMemoryVectorStore`, `createRetrieverTool`, `embedText` |

Workflow skills (read the matching `SKILL.md` before a multi-step task):

- `../skills/vista-dev-loop/SKILL.md`
- `../skills/vista-agent/SKILL.md`
- `../skills/vista-rag/SKILL.md`

Imports in an app are `vista/...`. The published package name is `@vistagenic/vista`.
