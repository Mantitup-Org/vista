# Vista.js

Vista.js is a React 19 framework with App Router conventions, React Server Components, standalone `.vista` output, and a dual-engine model:

- `default`: the main webpack-backed RSC/SSR engine
- `flashpack`: a Rust-backed engine path that records graph/runtime state in `.flash`

Official site: https://vista-js.vercel.app

## Packages

| Package             | Purpose                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `@vistagenic/vista` | Framework runtime, CLI, server/client exports, cache APIs, fonts, theme APIs |
| `create-vista-app`  | Scaffolds Vista apps with engine selection and package-manager prompts       |
| `vista-native`      | Internal Rust/NAPI bridge used by the repo                                   |

## Current Capabilities

Vista currently ships the following core surface:

- App Router-style file conventions under `app/`
- React Server Components and streaming SSR
- Server Actions and runtime action manifests
- Cache APIs: `unstable_cache`, `revalidateTag`, `revalidatePath`, `cacheTag`, `cacheLife`
- Route groups, parallel routes, interception routes, slot defaults, loading/error/not-found boundaries
- Segment config support (`dynamic`, `revalidate`, `runtime`, `preferredRegion`, `maxDuration`, `fetchCache`)
- Standalone `.vista` output with manifests, file tracing, PPR shell artifacts, and runtime metadata
- Flashpack `.flash` runtime state for `dev`, `build`, and `start`
- Metadata route support through app files like `app/(seo)/sitemap.ts`, `robots.ts`, and `manifest.ts`
- Package-level theme primitives via `vista/theme`
- Experimental typed API package surface via `vista/stack` and `vista/stack/client`

## Quick Start

Create a default app:

```bash
npx create-vista-app@latest my-app
cd my-app
npm run dev
```

Create a Flashpack app:

```bash
npx create-vista-app@latest my-app --engine flashpack
cd my-app
npm run dev
```

Create a typed API starter:

```bash
npx create-vista-app@latest my-app --typed-api
```

By default, generated apps use the same commands regardless of engine:

```bash
npm run dev
npm run build
npm run start
```

The selected engine is stored in `vista.config.ts`.

## Package Examples

Theme provider from the package:

```tsx
import { ThemeProvider, ThemeScript } from 'vista/theme';
```

Cache APIs from the package:

```ts
import { unstable_cache, revalidateTag, revalidatePath } from 'vista/cache';
```

Server helpers from the package:

```ts
import { cookies, headers, draftMode } from 'vista/server';
```

## Monorepo Layout

```text
vista-source/
├── apps/
│   └── web/                    # Official website and docs at vista.xyz
├── bench/                      # Vista-first benchmark fixtures
├── crates/                     # Top-level Rust crates and NAPI surface
├── flashpack/                  # Rust-backed Flashpack engine crates
├── packages/
│   ├── vista/                  # Framework package
│   └── create-vista-app/       # Scaffolding CLI
├── scripts/                    # Test, guard, and benchmark helpers
├── task.md                     # Execution ledger / milestone history
├── CONTRIBUTING.md
└── developer.md
```

## Local Development

Install workspace dependencies:

```bash
pnpm install
```

Build the framework package after touching `packages/vista/src`:

```bash
npm --prefix packages/vista run build
```

Build the website:

```bash
npm --prefix apps/web run build
```

Build the native binding when you change `crates/vista-napi`:

```bash
npm --prefix crates/vista-napi run build
```

## Common Commands

| Command                     | Purpose                                      |
| --------------------------- | -------------------------------------------- |
| `pnpm build`                | Build the workspace through `flash-run.cjs`  |
| `pnpm dev`                  | Run workspace dev tasks                      |
| `pnpm test`                 | Full repo test chain                         |
| `pnpm test:integrity`       | Framework integrity guard                    |
| `pnpm test:rsc-conformance` | RSC and route conformance suite              |
| `pnpm test:vista-output`    | `.vista` standalone/output verification      |
| `pnpm test:flashpack-dev`   | Flashpack dev/restart verification           |
| `pnpm test:flashpack-state` | Flashpack state reuse / cleanup verification |
| `pnpm bench`                | Full benchmark run                           |
| `pnpm bench:quick`          | Quick benchmark smoke run                    |

## Multi-Platform Deployment Support

Vista includes a unified deployment adapter pipeline supporting zero-config deployment across major cloud providers and container environments:

- **Vercel**: Native Build Output API v3 (`.vercel/output`) with static asset edge routing and Node.js 20 serverless function execution (`index.func`).
- **Cloudflare Pages & Workers**: Edge deployment with `_routes.json` static bypass caching and `_worker.js` dynamic fetch handler.
- **Render**: Production web service with automated `render.yaml` and keep-awake GitHub Action workflows.
- **Docker**: Production-ready multi-stage `Dockerfile` and `.dockerignore` targeting the unprivileged standalone Node runtime.
- **Node.js**: Zero-dependency standalone server bundle in `.vista/standalone`.

### Deployment CLI Commands

```bash
# Target-specific production builds
vista build --target vercel       # Build for Vercel Build Output API v3
vista build --target cloudflare   # Build for Cloudflare Pages & Workers
vista build --target docker       # Build and containerize
vista build --target render       # Build for Render Web Services

# On-demand blueprint generation
vista blueprint vercel            # Generate vercel.json
vista blueprint cloudflare        # Generate wrangler.toml
vista blueprint render            # Generate render.yaml and keep-awake workflow
vista blueprint docker            # Generate Dockerfile and .dockerignore
```

### Deployment Configuration (`vista.config.ts`)

```typescript
import { defineConfig } from '@vistagenic/vista';

export default defineConfig({
  deployment: {
    target: 'auto', // 'auto' | 'vercel' | 'cloudflare' | 'render' | 'docker' | 'node'
    generateBlueprints: true,
    port: 3003,
  },
});
```

Automatic platform detection recognizes environment variables (`VERCEL`, `CF_PAGES`, `RENDER`, `DOCKER`) and project files (`vercel.json`, `wrangler.toml`, `render.yaml`, `Dockerfile`) without manual flags.

## Deployment Notes

The repo includes first-party deployment config for the official site:

- `render.yaml`
- `vercel.json`

`apps/web` is the deployment target. Its SEO route files live in `app/(seo)/`, not `public/`.

## Release Flow

Maintainers publish from the `development` branch.

Typical sequence:

```bash
git add -A
git commit -m "release: x.y.z"
git push origin development
npx lerna publish from-package --yes
git tag vx.y.z
git push origin vx.y.z
```

## Learn More

- Official site: https://vista-js.vercel.app
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Internal contributor guide: [developer.md](developer.md)
- Benchmark guide: [bench/README.md](bench/README.md)
