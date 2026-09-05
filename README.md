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
- Server Actions (both exported modules and inline actions passed across Client Component boundaries) with runtime action manifests
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

## Server Actions

Vista.js supports React 19 Server Actions with full React Server Component conformance. Server Actions can be declared as module exports or defined inline within Server Components and passed across client boundaries:

### Inline Server Actions

Define inline server actions with `'use server'` inside Server Components and pass them as props directly to Client Components:

```tsx
// app/page.tsx (Server Component)
import { ActionProbe } from './action-probe';

export default function Page() {
  async function inlineEcho(value: string) {
    'use server';
    return { ok: true, value: `echo-${value}` };
  }

  return <ActionProbe action={inlineEcho} />;
}
```

### Exported Server Actions

Define actions in dedicated files marked with `'use server'` at the top level:

```ts
// app/actions.ts
'use server';

export async function updateUser(userId: string, data: FormData) {
  // Mutation executed securely on the server
  return { success: true };
}
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

| Command                     | Purpose                                          |
| --------------------------- | ------------------------------------------------ |
| `pnpm build`                | Build the workspace through `flash-run.cjs`      |
| `pnpm dev`                  | Run workspace dev tasks                          |
| `pnpm test`                 | Full repo test chain                             |
| `pnpm test:integrity`       | Framework integrity guard                        |
| `pnpm test:server-runtime`  | Server runtime & action reference unit tests     |
| `pnpm test:rsc-conformance` | RSC, server actions, and route conformance suite |
| `pnpm test:vista-output`    | `.vista` standalone/output verification          |
| `pnpm test:flashpack-dev`   | Flashpack dev/restart verification               |
| `pnpm test:flashpack-state` | Flashpack state reuse / cleanup verification     |
| `pnpm bench`                | Full benchmark run                               |
| `pnpm bench:quick`          | Quick benchmark smoke run                        |

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
