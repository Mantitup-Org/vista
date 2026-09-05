# Vista.js

Vista.js is a React 19 framework with App Router conventions, React Server Components, standalone `.vista` output, and a dual-engine model:

- `default`: the main webpack-backed RSC/SSR engine
- `flashpack`: a Rust-backed engine path that records graph/runtime state in `.flash`

Official site: https://vista-js.vercel.app

## Packages

| Package | Purpose |
| --- | --- |
| `@vistagenic/vista` | Framework runtime, CLI, server/client exports, cache APIs, fonts, theme APIs |
| `create-vista-app` | Scaffolds Vista apps with engine selection and package-manager prompts |
| `vista-native` | Internal Rust/NAPI bridge used by the repo |

## Current Capabilities

Vista currently ships the following core surface:

- App Router-style file conventions under `app/`
- React Server Components and streaming SSR
- Server Actions and runtime action manifests
- File-based API routes: `app/**/route.ts` handlers with dynamic segments, on both engines
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

## API Routes

Add a `route.ts` file anywhere under `app/` and that directory becomes an HTTP
endpoint. No config, no separate backend, no server wiring:

```
src/
└── app/
    ├── page.tsx            ->  /
    └── api/
        ├── users/
        │   ├── route.ts    ->  /api/users
        │   └── [id]/
        │       └── route.ts ->  /api/users/:id
        └── health/
            └── route.ts    ->  /api/health
```

Export one function per HTTP method. `GET`, `HEAD`, `POST`, `PUT`, `PATCH`,
`DELETE`, and `OPTIONS` are supported:

```ts
// app/api/users/route.ts
import { listUsers, createUser } from './user-store';

export async function GET() {
  return Response.json({ users: await listUsers() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const user = await createUser(body);

  return Response.json({ user }, { status: 201 });
}
```

Dynamic segments follow the same `[param]` conventions as pages, and their values
arrive on the second argument:

```ts
// app/api/users/[id]/route.ts
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return Response.json({ id: params.id });
}
```

| File | URL | `params` |
| --- | --- | --- |
| `app/api/users/route.ts` | `/api/users` | `{}` |
| `app/api/users/[id]/route.ts` | `/api/users/42` | `{ id: '42' }` |
| `app/api/files/[...path]/route.ts` | `/api/files/a/b.txt` | `{ path: ['a', 'b.txt'] }` |
| `app/api/docs/[[...slug]]/route.ts` | `/api/docs` | `{ slug: [] }` |
| `app/(internal)/metrics/route.ts` | `/metrics` | `{}` |

A more specific route always wins, so `app/api/users/me/route.ts` is matched before
`app/api/users/[id]/route.ts`.

Route handlers are server-only by construction. They are never entered into the
client graph, so anything they import - database clients, secrets, private helpers -
stays out of the browser bundle:

```ts
// app/api/users/user-store.ts  (never shipped to the client)
import { db } from '@/lib/db';

export function listUsers() {
  return db.user.findMany();
}
```

Two things happen automatically:

- **Method handling.** A method with no export returns `405` with an `Allow` header,
  `HEAD` falls back to the `GET` handler, and an unhandled `OPTIONS` is answered from
  the exported method list so CORS preflight works out of the box.
- **Registration.** Route files are discovered at build time and recorded in
  `.vista/routes-manifest.json` and `.vista/app-path-routes-manifest.json`, so
  deployment adapters can see them without re-scanning your source.

Opt a handler into the edge runtime with the usual segment config:

```ts
export const runtime = 'edge';
```

A runnable example lives in [`sample-app/app/api/hello/route.ts`](sample-app/app/api/hello/route.ts).

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

| Command | Purpose |
| --- | --- |
| `pnpm build` | Build the workspace through `flash-run.cjs` |
| `pnpm dev` | Run workspace dev tasks |
| `pnpm test` | Full repo test chain |
| `pnpm test:integrity` | Framework integrity guard |
| `pnpm test:rsc-conformance` | RSC and route conformance suite |
| `pnpm test:vista-output` | `.vista` standalone/output verification |
| `pnpm test:flashpack-dev` | Flashpack dev/restart verification |
| `pnpm test:flashpack-state` | Flashpack state reuse / cleanup verification |
| `pnpm bench` | Full benchmark run |
| `pnpm bench:quick` | Quick benchmark smoke run |

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
