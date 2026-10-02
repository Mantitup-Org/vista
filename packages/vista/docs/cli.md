# CLI

## Create an app

```bash
npx create-vista-app@latest my-app
npx create-vista-app@latest my-app --engine flashpack
npx create-vista-app@latest my-app --no-agents-md
```

The scaffold writes `AGENTS.md` and `CLAUDE.md` unless `--no-agents-md` is set. `CLAUDE.md` is `@AGENTS.md`.

## Generators

```bash
vista g api-init
vista g router <name>
vista g procedure <name> [get|post]
vista g agent <name>
vista g auth
vista g seo
```

- `vista g agent <name>` writes `app/agents/<name>/agent.ts`, `app/api/agents/<name>/route.ts`, and `app/AGENTS.md` if that file is missing.
- `vista g auth` writes `auth.ts`, `app/api/auth/[...vista]/route.ts`, `/signin`, `/account`, fail-closed `middleware.ts`, a `SessionProvider` wrapper, and `.env.example`. Set `AUTH_SECRET` before signing in. Import the server helper from `vista/auth` and the client helper from `vista/auth/react`.
- `vista g api-init` starts the typed API. Call procedures from a Server Component with `v.createCaller(router, { ctx, env })`.
- `vista g seo` writes `app/robots.ts`, `app/sitemap.ts`, and `app/manifest.ts`.

`vista deploy` writes platform files. The scaffold does not copy Docker, Render, Netlify, Vercel, or Cloudflare configs.
