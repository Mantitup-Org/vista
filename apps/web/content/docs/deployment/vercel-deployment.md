---
category: 'deployment'
slug: 'vercel-deployment'
title: 'Vercel Deployment'
summary: 'Deploy Vista apps to Vercel using the native Build Output API v3.'
order: 2
updatedAt: '2026-03-20'
---

Vista provides native support for **Vercel Build Output API v3**, enabling seamless deployment with both static asset caching and serverless function SSR/API handling.

## Quick Start

### Automatic Detection

When deploying on Vercel, Vista automatically detects the environment (`VERCEL=1`) and compiles your application directly into `.vercel/output/`:

```bash
vista build
```

### Explicit Target

To build specifically for Vercel locally or in custom CI pipelines:

```bash
vista build --target vercel
```

Or configure in `vista.config.ts`:

```typescript
import { defineConfig } from '@vistagenic/vista';

export default defineConfig({
  deployment: {
    target: 'vercel',
    generateBlueprints: true,
  },
});
```

## Generate Blueprint

To generate a `vercel.json` blueprint file for your project:

```bash
vista blueprint vercel
```

This creates a `vercel.json` configured for Vista:

```json title="vercel.json"
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": ".vercel/output",
  "framework": null,
  "installCommand": "npm install --no-audit --no-fund",
  "devCommand": "npm run dev"
}
```

## Build Output Structure

When building for Vercel, Vista produces:

- `.vercel/output/static/`: Static assets (`public/`, `.vista/static/`, compiled CSS) served directly by Vercel's Edge Network.
- `.vercel/output/functions/index.func/`: Standalone serverless function (`nodejs20.x`) handling dynamic RSC rendering and API routes.
- `.vercel/output/config.json`: Routing rules routing static files first, falling back to serverless functions.

## Related

- [Render Deployment](/docs/deployment/render-deployment)
- [Cloudflare Deployment](/docs/deployment/cloudflare-deployment)
- [Docker Deployment](/docs/deployment/docker-deployment)
- [Vista Config Reference](/docs/reference/vista-config-reference)
