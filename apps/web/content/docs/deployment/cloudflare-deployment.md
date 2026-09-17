---
category: deployment
slug: cloudflare-deployment
title: Cloudflare Pages Deployment
summary: Deploy pre-rendered Vista apps to Cloudflare Pages with vista deploy --target cloudflare.
order: 4
updatedAt: "2026-09-07"
---

> Cloudflare Pages support in Vista v1 is static/pre-rendered output. Full dynamic SSR is not available on Workers yet.

## One-Command Deploy

```bash
npm run deploy -- --target cloudflare --prod
```

Dry-run to validate artifacts only:

```bash
npm run deploy -- --target cloudflare --dry-run --force
```

## What Vista Emits

- `.vista/deploy/cloudflare/` static bundle
- `_routes.json` and `_redirects`
- `wrangler.toml` with `pages_build_output_dir`

## Wrangler Fallback

If Wrangler is installed and authenticated:

```bash
wrangler pages deploy .vista/deploy/cloudflare --project-name my-vista-app
```

Otherwise `vista deploy` prints next steps after emitting artifacts.

## Static Host Configuration

For image components on static hosts:

```ts title="vista.config.ts"
images: {
  unoptimized: true,
}
```

## Limitations

- No live Node RSC server on Pages static deploys
- Server actions, typed API, and request-time SSR require Render or Docker

## Related

- [Vista Deploy Command](/docs/deployment/vista-deploy-command)
- [Platform Matrix](/docs/deployment/platform-matrix)
- [Render Deployment (Recommended for full apps)](/docs/deployment/render-deployment)
