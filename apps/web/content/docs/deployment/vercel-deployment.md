---
category: "deployment"
slug: "vercel-deployment"
title: "Vercel Deployment"
summary: "Deploy pre-rendered Vista apps to Vercel with npm run deploy --target vercel."
order: 3
updatedAt: "2026-09-07"
---

> Vercel deploys in Vista are static/pre-rendered. Use Render or Docker for full SSR and server actions.

## One-Command Deploy

```bash
npm run deploy -- --target vercel --prod
```

Validate build output only:

```bash
npm run deploy -- --target vercel --dry-run --force
```

## How It Works

`vista deploy --target vercel` emits Vercel Build Output at `.vercel/output/` with route rewrites to `.vista/static/pages/*.{html,rsc}`.

If the Vercel CLI is installed and authenticated, Vista runs `vercel deploy` automatically. Otherwise it prints next steps.

## Optional vercel.json

You can keep a custom `vercel.json`. Vista skips auto-generation unless you pass `--force`.

```json title="vercel.json"
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": ".vista",
  "framework": null,
  "installCommand": "npm install --legacy-peer-deps --no-audit --no-fund",
  "devCommand": "npm run dev"
}
```

## Static Host Notes

- Pre-render pages at build time for routes you need on Vercel
- Set `images.unoptimized: true` when using `vista/image`
- Typed API and server actions require a Node host

## Recommendation

For production SLAs with dynamic behavior, deploy to Render first. Use Vercel for static sites and previews.

## Related

- [Vista Deploy Command](/docs/deployment/vista-deploy-command)
- [Platform Matrix](/docs/deployment/platform-matrix)
- [Render Deployment (Recommended)](/docs/deployment/render-deployment)
