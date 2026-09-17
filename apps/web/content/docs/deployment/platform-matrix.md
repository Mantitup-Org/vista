---
category: deployment
slug: platform-matrix
title: Deployment Platform Matrix
summary: Feature support and recommended targets for Vista apps on major hosting providers.
order: 0
updatedAt: "2026-09-07"
---

## Choose the Right Target

| Feature | Render | Docker | Vercel | Cloudflare Pages | Netlify |
|---|---|---|---|---|---|
| Dynamic SSR | Yes | Yes | No | No | No |
| Server actions | Yes | Yes | No | No | No |
| Typed API | Yes | Yes | No | No | No |
| ISR / live revalidation | Yes | Yes | Limited | Limited | Limited |
| SSG / pre-rendered pages | Yes | Yes | Yes | Yes | Yes |
| Edge route handlers only | Yes | Yes | Partial | Partial | Partial |

## Recommended Defaults

- **Full Vista apps:** `render` or `docker`
- **Marketing/docs sites (mostly static):** `vercel`, `cloudflare`, or `netlify`
- **Local/production parity testing:** `docker`

## Deploy Commands

```bash
npm run deploy -- --target render --prod
npm run deploy -- --target vercel --dry-run
npm run deploy -- --target cloudflare --force
```

## Static Host Notes

Static CDN targets serve files from `.vista/static`. They do not run the Node RSC server.

For static hosts:

- Ensure pages are pre-rendered at build time
- Set `images.unoptimized: true` when using `vista/image`
- Avoid typed API and server-side API routes unless you accept degraded behavior

## Related

- [Vista Deploy Command](/docs/deployment/vista-deploy-command)
- [Render Deployment](/docs/deployment/render-deployment)
- [Vercel Deployment](/docs/deployment/vercel-deployment)
- [Cloudflare Deployment](/docs/deployment/cloudflare-deployment)
