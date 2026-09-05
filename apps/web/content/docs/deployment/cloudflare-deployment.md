---
category: "deployment"
slug: "cloudflare-deployment"
title: "Cloudflare Deployment"
summary: "Serve Vista static output on Cloudflare and keep dynamic RSC/API on a Node origin."
order: 4
updatedAt: "2026-09-05"
---

## What Cloudflare gets for free

`vista build` writes:

- `.vista/deploy/wrangler.toml`
- `.vista/deploy/cloudflare-worker.js`
- `.vista/static` assets

```bash
npx vista build
npx wrangler deploy --config .vista/deploy/wrangler.toml
```

## Full-stack traffic

Cloudflare is a great CDN for pre-rendered pages. Server Actions, `route.ts` handlers, and agents need a Node.js process (`vista start`). Pair Cloudflare assets with Render, Fly, or Docker for origin compute.

## Related
- [Render Deployment](/docs/deployment/render-deployment)
- [Vercel Deployment](/docs/deployment/vercel-deployment)
