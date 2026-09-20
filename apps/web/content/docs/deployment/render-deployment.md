---
category: deployment
slug: render-deployment
title: Render Deployment
summary: Deploy full-feature Vista apps to Render with npm run deploy or render.yaml.
order: 2
updatedAt: "2026-09-07"
---

> Render is a long-running Node host for full Vista apps (SSR, server actions, typed API). Vercel, Netlify, Cloudflare Containers, and Docker use the same standalone Flight server.

## One-Command Deploy

```bash
npm run deploy -- --target render --prod
```

Validate artifacts without deploying:

```bash
npm run deploy -- --target render --dry-run
```

## render.yaml Blueprint

New apps scaffolded with `create-vista-app` include a starter `render.yaml`:

```yaml title="render.yaml"
services:
  - type: web
    name: my-vista-app
    runtime: node
    buildCommand: |
      npm install --no-audit --no-fund
      npm run build
    startCommand: npm run start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3003"
    healthCheckPath: /
```

Connect the repo on [Render](https://dashboard.render.com) and apply the Blueprint.

## Why This Works

- `npm run build` emits `.vista/standalone/server.js`
- `npm run start` runs the standalone Node server
- Full RSC runtime features are supported

## Keep Free Render Service Awake

If your free Render service sleeps, use a scheduled GitHub Action ping.

```yaml title=".github/workflows/keep-render-awake.yml"
name: Keep Render Awake

on:
  schedule:
    - cron: "*/10 * * * *"
  workflow_dispatch:

jobs:
  ping-render:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Render app
        env:
          RENDER_APP_URL: ${{ secrets.RENDER_APP_URL }}
        run: curl -sS -L "$RENDER_APP_URL/"
```

## Related

- [Vista Deploy Command](/docs/deployment/vista-deploy-command)
- [Platform Matrix](/docs/deployment/platform-matrix)
- [Vercel Deployment](/docs/deployment/vercel-deployment)
- [Netlify Deployment](/docs/deployment/netlify-deployment)
