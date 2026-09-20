---
category: "deployment"
slug: "cloudflare-deployment"
title: "Cloudflare Deployment"
summary: "Deploy Vista Flight SSR on Cloudflare Containers, or static Pages when you opt in."
order: 4
updatedAt: "2026-09-20"
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

Serves pre-rendered `.vista/static` on Cloudflare Pages only (no request-time SSR).

## Related

- [Vista Deploy Command](/docs/deployment/vista-deploy-command)
- [Platform Matrix](/docs/deployment/platform-matrix)
- [Render Deployment](/docs/deployment/render-deployment)
