---
category: 'deployment'
slug: 'docker-deployment'
title: 'Docker & Container Deployment'
summary: 'Containerize Vista applications using production-ready multi-stage Docker builds.'
order: 4
updatedAt: '2026-03-20'
---

Vista provides built-in container deployment support with optimized multi-stage `Dockerfile` and `.dockerignore` generation.

## Quick Start

### Build Container Artifacts

Build your app for Docker containerization:

```bash
vista build --target docker
```

Or configure in `vista.config.ts`:

```typescript
import { defineConfig } from '@vistagenic/vista';

export default defineConfig({
  deployment: {
    target: 'docker',
    port: 3003,
  },
});
```

## Generate Docker Blueprints

Generate production `Dockerfile` and `.dockerignore`:

```bash
vista blueprint docker
```

This generates a multi-stage `Dockerfile` based on `node:20-alpine`:

- **`deps` stage**: Caches lockfile dependencies (`pnpm`, `yarn`, or `npm`).
- **`builder` stage**: Compiles standalone server bundles and static assets.
- **`runner` stage**: Creates an unprivileged `vista:nodejs` user, copies minimal standalone artifacts, and exposes the configured port (default `3003`).

## Building & Running the Image

```bash
# Build the Docker image
docker build -t my-vista-app .

# Run the container
docker run -p 3003:3003 my-vista-app
```

## Related

- [Render Deployment](/docs/deployment/render-deployment)
- [Vercel Deployment](/docs/deployment/vercel-deployment)
- [Cloudflare Deployment](/docs/deployment/cloudflare-deployment)
