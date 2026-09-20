---
category: deployment
slug: vista-deploy-command
title: Vista Deploy Command
summary: Deploy Vista apps with npm run deploy or vista deploy across Render, Vercel, Cloudflare, Netlify, and Docker.
order: 1
updatedAt: "2026-09-20"
---

> Use `npm run deploy` or `vista deploy` as the single entrypoint for production deployment.

## Quick Start

```bash
npm run build
npm run deploy
```

Or pass an explicit target:

```bash
npm run deploy -- --target render --prod
npm run deploy -- --target vercel --dry-run
npm run deploy -- --target cloudflare --force
```

## Supported Targets

| Target | Runtime | Full SSR / actions / typed API |
|---|---|---|
| `render` | Node standalone | Yes |
| `docker` | Node standalone | Yes |
| `vercel` | Node serverless (Build Output v3) | Yes |
| `cloudflare` | Containers (Docker) | Yes |
| `netlify` | Node Functions | Yes |

Set `deploy.output: 'static'` on Vercel, Cloudflare, or Netlify for CDN-only pre-rendered sites.

## Command Options

```bash
vista deploy [options]

  --target <render|vercel|cloudflare|netlify|docker>
  --prod                 Production deploy (default)
  --preview              Preview/staging deploy
  --dry-run              Build + emit + validate only
  --skip-build           Use existing .vista artifacts
  --force                Overwrite generated platform configs
```

## Auto-Detection

When `--target` is omitted, Vista resolves the target in this order:

1. `deploy.target` in `vista.config.ts`
2. Platform environment variables (`VERCEL`, `CF_PAGES`, `RENDER`, `NETLIFY`)
3. Existing project files (`render.yaml`, `vercel.json`, `wrangler.toml`, `netlify.toml`, `Dockerfile`)

## Config

```ts title="vista.config.ts"
export default {
  deploy: {
    target: 'auto',
    preferBuildOutputApi: true,
  },
};
```

## CLI Fallback Behavior

`vista deploy` tries the platform CLI when installed:

- Vercel: `vercel deploy`
- Cloudflare: `wrangler deploy` (Containers) or `wrangler pages deploy` when `deploy.output` is `static`
- Netlify: `netlify deploy --dir=.vista/deploy/netlify --functions=netlify/functions`
- Render: `render deploy` or Blueprint/git instructions
- Docker: `docker build`

If the CLI is missing or auth fails, Vista still emits deploy artifacts and prints next steps.

## Related

- [Platform Matrix](/docs/deployment/platform-matrix)
- [Render Deployment](/docs/deployment/render-deployment)
- [Vercel Deployment](/docs/deployment/vercel-deployment)
- [Cloudflare Deployment](/docs/deployment/cloudflare-deployment)
- [Netlify Deployment](/docs/deployment/netlify-deployment)
