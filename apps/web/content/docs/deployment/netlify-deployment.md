---
category: "deployment"
slug: "netlify-deployment"
title: "Netlify Deployment"
summary: "Deploy Vista Flight SSR to Netlify as a Node function."
order: 5
updatedAt: "2026-09-20"
---

Vista on Netlify runs the **same Node Flight server** as Render/Docker, packed as a Function. `http.IncomingMessage` / `http.ServerResponse` are used so Flight HTML can stream through Express.

## One-Command Deploy

```bash
npm run deploy -- --target netlify --prod
```

Validate artifacts only:

```bash
npm run deploy -- --target netlify --dry-run --force
```

## How It Works

`vista deploy --target netlify` emits:

- `.vista/deploy/netlify` — hashed client assets
- `netlify/functions/ssr.js` — Lambda handler that calls `createRequestListener()`
- `netlify/functions/.vista` — standalone Flight runtime
- `netlify.toml` — catch-all rewrite to the function

Deploy with:

```bash
netlify deploy --prod --dir=".vista/deploy/netlify" --functions="netlify/functions"
```

## Static-only (optional)

CDN/pre-rendered pages without SSR:

```ts title="vista.config.ts"
deploy: {
  target: 'netlify',
  output: 'static',
}
```

## Related

- [Vista Deploy Command](/docs/deployment/vista-deploy-command)
- [Platform Matrix](/docs/deployment/platform-matrix)
