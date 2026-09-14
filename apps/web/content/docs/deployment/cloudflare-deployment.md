---
category: 'deployment'
slug: 'cloudflare-deployment'
title: 'Cloudflare Pages & Workers Deployment'
summary: 'Deploy Vista apps to Cloudflare Pages and Workers with smart edge routing.'
order: 3
updatedAt: '2026-03-20'
---

Vista includes first-class support for **Cloudflare Pages** and **Cloudflare Workers**, utilizing `_routes.json` for optimal static caching and `_worker.js` for edge dynamic dispatching.

## Quick Start

### Automatic Detection

When building in Cloudflare Pages (`CF_PAGES=1`), Vista detects the environment automatically:

```bash
vista build
```

### Explicit Target

To build specifically for Cloudflare:

```bash
vista build --target cloudflare
```

Or configure in `vista.config.ts`:

```typescript
import { defineConfig } from '@vistagenic/vista';

export default defineConfig({
  deployment: {
    target: 'cloudflare',
  },
});
```

## Generate Blueprint

To generate a `wrangler.toml` blueprint for your project:

```bash
vista blueprint cloudflare
```

Generated `wrangler.toml`:

```toml title="wrangler.toml"
name = "my-vista-app"
compatibility_date = "2026-03-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".vista/cloudflare"
```

## Build Output Structure

When building for Cloudflare, Vista outputs to `.vista/cloudflare/`:

- `_routes.json`: Instructs Cloudflare Pages to serve static files (`/static/*`, `/favicon.ico`, `/styles.css`) directly from Cloudflare's CDN without invoking worker invocations.
- `_worker.js`: Modern edge handler processing dynamic RSC and route requests.
- `static/`: Bundled client components and static pages.

## Related

- [Vercel Deployment](/docs/deployment/vercel-deployment)
- [Render Deployment](/docs/deployment/render-deployment)
- [Docker Deployment](/docs/deployment/docker-deployment)
