---
category: deployment
slug: platform-matrix
title: Deployment Platform Matrix
summary: Feature support and recommended targets for Vista apps on major hosting providers.
order: 0
updatedAt: "2026-09-20"
---

## Choose the Right Target

| Feature | Render | Docker | Vercel | Cloudflare | Netlify |
|---|---|---|---|---|---|
| Dynamic Flight SSR | Yes | Yes | Yes (Node serverless) | Yes (Containers) | Yes (Functions) |
| Server actions | Yes | Yes | Yes | Yes | Yes |
| Typed API | Yes | Yes | Yes | Yes | Yes |
| ISR / live revalidation | Yes | Yes | Yes | Yes | Yes |
| SSG / pre-rendered pages | Yes | Yes | Yes | Yes | Yes |

Default is **standalone** (Node Flight server). Set `deploy.output: 'static'` for CDN-only pre-rendered sites.

## Recommended Defaults

- **Full Vista apps:** `vercel`, `render`, `docker`, `netlify`, or Cloudflare Containers
- **Marketing/docs (SSG only):** `deploy.output: 'static'` on Vercel, Cloudflare Pages, or Netlify
- **Local/production parity:** `docker`

## Deploy Commands

```bash
npm run deploy -- --target vercel --prod
npm run deploy -- --target cloudflare --dry-run
npm run deploy -- --target netlify --force
npm run deploy -- --target render --prod
```

## Notes

- **Vercel** emits Build Output API v3 with a Node.js function that runs `.vista/standalone`.
- **Netlify** emits a Function that runs the same standalone server.
- **Cloudflare Workers** cannot spawn the Flight upstream process. Vista deploys SSR there as a **Container** (same Dockerfile as `docker`).
- Static CDN mode still works when you set `deploy.output: 'static'`.

## Related

- [Vista Deploy Command](/docs/deployment/vista-deploy-command)
- [Vercel Deployment](/docs/deployment/vercel-deployment)
- [Cloudflare Deployment](/docs/deployment/cloudflare-deployment)
- [Netlify Deployment](/docs/deployment/netlify-deployment)
- [Render Deployment](/docs/deployment/render-deployment)
