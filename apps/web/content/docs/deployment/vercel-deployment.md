---
category: "deployment"
slug: "vercel-deployment"
title: "Vercel Deployment"
summary: "Deploy Vista Flight SSR to Vercel as a Node.js serverless function."
order: 3
updatedAt: "2026-09-20"
---

Vista on Vercel runs the **same Node Flight server** as Render/Docker, packed as a Build Output API v3 serverless function.

## One-Command Deploy

```bash
npm run deploy -- --target vercel --prod
```

Validate artifacts only:

```bash
npm run deploy -- --target vercel --dry-run --force
```

## How It Works

`vista build` writes `.vista/standalone`. `vista deploy --target vercel` emits:

- `.vercel/output/static` — hashed client assets (`/_vista/static/*`)
- `.vercel/output/functions/index.func` — Node 20 handler that calls `createRequestListener()`
- `.vercel/output/config.json` — filesystem first, then catch-all to the function

Git deploys on the Vercel dashboard also work: set build command to `npm run build` (Vista writes `.vercel/output` when `VERCEL=1`).

The function uses Node 20, 1024 MB, 60s max duration, and `supportsResponseStreaming`. Raise `maxDuration` in `.vercel/output/functions/index.func/.vc-config.json` on Pro if cold start plus Flight is tight.

## Static-only (optional)

CDN/pre-rendered pages without SSR:

```ts title="vista.config.ts"
deploy: {
  target: 'vercel',
  output: 'static',
}
```

## Related

- [Vista Deploy Command](/docs/deployment/vista-deploy-command)
- [Platform Matrix](/docs/deployment/platform-matrix)
- [Cloudflare Deployment](/docs/deployment/cloudflare-deployment)
- [Netlify Deployment](/docs/deployment/netlify-deployment)
