---
category: "deployment"
slug: "cloudflare-deployment"
title: "Cloudflare Deployment"
summary: "Deploy Vista Flight SSR on Cloudflare Containers, or static Pages when you opt in — including copy-paste prompts for AI agents using Wrangler."
order: 4
updatedAt: "2026-10-02"
---

Cloudflare **Workers cannot run Vista’s dual-process Flight server** (no `child_process` with `--conditions react-server`). Full SSR uses **Cloudflare Containers** and the same Dockerfile as `vista deploy --target docker`.

## Full SSR (default)

```bash
npm run deploy -- --target cloudflare --prod
```

This emits:

- `Dockerfile` — `node .vista/standalone/server.js` with production `node_modules`
- `.vista/deploy/cloudflare/worker.js` — Durable Object that starts the container on port 3003
- `wrangler.toml` — Containers + Durable Object binding + SQLite migration

Then:

```bash
npx wrangler login
npx wrangler deploy --prod
```

If Containers are not enabled on the account, run the same image on Fly, Railway, Render, or any Docker host.

## Static Pages (optional)

```ts title="vista.config.ts"
deploy: {
  target: 'cloudflare',
  output: 'static',
}
```

```bash
npm run deploy -- --target cloudflare --prod
```

Serves pre-rendered `.vista/static` on Cloudflare Pages only (no request-time SSR). Wrangler fallback:

```bash
npx wrangler pages deploy .vista/deploy/cloudflare --project-name my-vista-app
```

## AI agent prompt — Cloudflare deploy

Paste this into Cursor, Claude Code, or any coding agent so it can deploy the current Vista app to Cloudflare for you.

```prompt title="Copy prompt — Cloudflare deploy"
You are deploying a Vista.js app to Cloudflare.

Rules:
- This is a Vista app (package `vista` / `@vistagenic/vista`), not Next.js. Prefer `vista deploy` / `npm run deploy`.
- Full SSR (APIs, auth, agents, Flight) must use Cloudflare Containers + Wrangler — not Workers-only or Pages Functions SSR.
- Static-only is allowed only if `vista.config.ts` has `deploy: { target: 'cloudflare', output: 'static' }`.

Do this in the project root:

1. Read `package.json`, `vista.config.ts`, and any existing `wrangler.toml` / `Dockerfile`.
2. Ensure dependencies are installed.
3. Build if needed: `npm run build` (or pnpm/yarn/bun equivalent).
4. Emit + deploy Cloudflare artifacts:
   - Full SSR (default): `npm run deploy -- --target cloudflare --prod`
   - Static Pages: ensure `deploy.output` is `'static'`, then `npm run deploy -- --target cloudflare --prod`
5. If Wrangler is not authenticated, run `npx wrangler login` and wait for the user to finish browser login.
6. If `vista deploy` stopped after emitting files, finish with Wrangler:
   - Full SSR: `npx wrangler deploy --prod`
   - Static: `npx wrangler pages deploy .vista/deploy/cloudflare --project-name <app-name>`
7. Report the final URL, any Wrangler errors, and whether Containers vs Pages was used.

Do not invent Next.js `open-next` / `@cloudflare/next-on-pages` paths. Do not rewrite the app to a Workers-only handler.
```

## AI agent prompt — Wrangler only

Use this when artifacts already exist (`wrangler.toml`, Dockerfile / `.vista/deploy/cloudflare`) and you only want the agent to ship with Wrangler.

```prompt title="Copy prompt — Wrangler deploy"
Deploy this Vista.js project to Cloudflare with Wrangler only.

Context:
- Full SSR uses Cloudflare Containers via the project's `wrangler.toml` (and usually a root `Dockerfile`). Command: `npx wrangler deploy --prod`
- Static Pages uses the emitted folder under `.vista/deploy/cloudflare`. Command: `npx wrangler pages deploy .vista/deploy/cloudflare --project-name <name>`

Steps:
1. Confirm whether this is Containers (`wrangler.toml` with container/Durable Object bindings) or static Pages (`deploy.output: 'static'` or a Pages-oriented wrangler config).
2. Ensure the user is logged in: `npx wrangler whoami` — if not, run `npx wrangler login` and pause for browser auth.
3. From the app root, run the matching Wrangler command above.
4. If deploy fails because artifacts are missing, stop and tell the user to run `npm run deploy -- --target cloudflare --prod` first (or `--dry-run` / emit step), then retry Wrangler.
5. Print the deployed URL and the exact Wrangler command used.

Do not switch to Workers-only SSR. Do not use Next.js adapters.
```

## Related

- [Vista Deploy Command](/docs/deployment/vista-deploy-command)
- [Platform Matrix](/docs/deployment/platform-matrix)
- [Render Deployment](/docs/deployment/render-deployment)
