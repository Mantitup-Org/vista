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
| Render | `npm run deploy -- --target render` | Full SSR, recommended for production |
| Docker | `npm run deploy -- --target docker` | Portable Node standalone image |
| Vercel | `npm run deploy -- --target vercel` | Static/pre-rendered pages |
| Cloudflare | `npm run deploy -- --target cloudflare` | Pages static bundle |
| Netlify | `npm run deploy -- --target netlify` | Static/pre-rendered pages |

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

## Keep Free Render Service Awake

See [`.github/workflows/keep-render-awake.yml`](.github/workflows/keep-render-awake.yml) and set the `RENDER_APP_URL` repository secret.
