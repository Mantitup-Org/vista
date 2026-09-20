# Deploying Vista

Use the Vista deploy command for production deployments:

```bash
npm run deploy
npm run deploy -- --target render --prod
npm run deploy -- --target vercel --dry-run
```

## Supported Platforms

| Platform | Command | Notes |
|---|---|---|
| Render | `npm run deploy -- --target render` | Long-running Node Flight server |
| Docker | `npm run deploy -- --target docker` | Portable Node standalone image |
| Vercel | `npm run deploy -- --target vercel` | Node serverless function (Build Output v3) |
| Cloudflare | `npm run deploy -- --target cloudflare` | Containers + Dockerfile (Workers cannot spawn Flight) |
| Netlify | `npm run deploy -- --target netlify` | Node Function wrapping the standalone server |

Set `deploy.output: 'static'` on Vercel, Cloudflare, or Netlify for CDN-only pre-rendered sites.

## Monorepo (this repository)

This repository includes a Render blueprint at [`render.yaml`](render.yaml) for the `apps/web` site.

For local development of the docs site:

```bash
cd apps/web
npm install
npm run dev
```

## Documentation

- [Vista Deploy Command](https://github.com/Mantitup-Org/vista/blob/main/apps/web/content/docs/deployment/vista-deploy-command.md)
- [Platform Matrix](https://github.com/Mantitup-Org/vista/blob/main/apps/web/content/docs/deployment/platform-matrix.md)
- [Render Deployment](https://github.com/Mantitup-Org/vista/blob/main/apps/web/content/docs/deployment/render-deployment.md)
- [Vercel Deployment](https://github.com/Mantitup-Org/vista/blob/main/apps/web/content/docs/deployment/vercel-deployment.md)
- [Cloudflare Deployment](https://github.com/Mantitup-Org/vista/blob/main/apps/web/content/docs/deployment/cloudflare-deployment.md)
- [Netlify Deployment](https://github.com/Mantitup-Org/vista/blob/main/apps/web/content/docs/deployment/netlify-deployment.md)

## Keep Free Render Service Awake

See [`.github/workflows/keep-render-awake.yml`](.github/workflows/keep-render-awake.yml) and set the `RENDER_APP_URL` repository secret.
