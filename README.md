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
import { cookies, headers, draftMode, NextResponse } from 'vista/server';
```

## Middleware

Vista.js includes a built-in middleware system that intercepts and processes requests before they reach a page or API route.

### 1. Global Middleware

Create a `middleware.ts` (or `.js`) file at the project root or inside `src/`:

```ts
// middleware.ts
import { NextResponse } from 'vista/server';

export async function middleware({ request, next }) {
  // Authentication, logging, validation, etc.
  if (request.nextUrl.pathname.startsWith('/admin') && !request.cookies.get('token')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const res = await next();
  res.headers.set('x-framework', 'vista');
  return res;
}

export const config = {
  matcher: ['/((?!_vista|static|favicon.ico).*)'],
};
```

### 2. Route-Specific Middleware

Vista.js supports route-level middleware in two ways:

- **Co-located segment middleware**: Place a `middleware.ts` inside any `app/` subfolder (e.g. `app/api/auth/middleware.ts` or `app/dashboard/middleware.ts`).
- **Exported route middleware**: Export a `middleware` function directly from a segment file (e.g. `export const middleware = ...` in `app/api/users/route.ts` or `app/dashboard/page.tsx`).

```ts
// app/dashboard/middleware.ts
export async function middleware({ request, next }) {
  const user = request.headers.get('x-user-role');
  if (user !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return next();
}
```

### 3. Execution Order

When multiple middlewares apply to a route, they execute in a deterministic outer-to-inner hierarchy:

1. **Global Middleware**: `<root>/middleware.ts` or `<root>/src/middleware.ts`
2. **Parent Segment Middleware**: `<root>/app/<segment>/middleware.ts`
3. **Child Segment Middleware**: `<root>/app/<segment>/<subsegment>/middleware.ts`
4. **Route File Middleware**: `export const middleware` in `page.tsx` or `route.ts`
5. **Target Route Handler**: Page component rendering or API route handler

Each middleware can wrap downstream execution using `await next()`, allowing post-processing on the response in reverse order (onion model). If any middleware returns a response without calling `next()`, execution short-circuits immediately and downstream handlers are bypassed.

### 4. Modifying Requests and Responses

- **Modify Request Headers**: Pass updated headers to `next({ request: { headers } })` to forward them to downstream middlewares and route handlers.
- **Modify Response Headers**: Inspect or add headers on the response returned by `await next()`.
- **Short-Circuit / Rejection**: Return a standard Fetch `Response`, `NextResponse.json(...)`, or custom error to reject unauthorized requests with full status and body support.
- **Redirects**: Return `Response.redirect(...)` or `NextResponse.redirect(...)`.

### 5. Interaction with Page & API Routes

Middleware runs before both page routes and API routes (`app/**/route.ts` or `app/api/`). Any rejection or redirect stops execution before page SSR/RSC rendering or API handler invocation occurs.

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
