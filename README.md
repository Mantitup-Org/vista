# Vista.js

Vista.js is a React 19 framework with App Router conventions, React Server Components, standalone `.vista` output, and a dual-engine model:

- `default`: the main webpack-backed RSC/SSR engine
- `flashpack`: a Rust-backed engine path that records graph/runtime state in `.flash`

Official site: https://vista-js.vercel.app

Repository: https://github.com/Mantitup-Org/vista

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
- Built-in Full-Stack Backend Support via API Routes (`route.ts` / `route.js`)
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
vista/
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

- Repository: https://github.com/Mantitup-Org/vista
- Official site: https://vista-js.vercel.app
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Internal contributor guide: [developer.md](developer.md)
- Benchmark guide: [bench/README.md](bench/README.md)

## Recent Fixes

### Issue #7.1: RSC Conformance Failure for Inline Actions
- **Fixed:** Resolved React Flight stringifier 500 errors (`Functions cannot be passed directly to Client Components...`) on inline Server Actions.
- **Technical Details:**
  - **Core Problem:** The legacy SWC AST visitor (`module-compile-hook.ts`) assumed all function bodies strictly used `BlockStatement` types.
  - **Modern Syntax Support:** Modern SWC emissions often yield `FunctionBody` types directly, specifically for arrow functions.
  - **The Fix:** Upgraded the AST traversal logic to safely process both node topologies.
  - **Result:** The compiler now correctly intercepts `'use server'` pragmas and injects the `registerInlineServerReference` wrappers, providing the Flight protocol with proper serialized reference pointers.
- **Proof of Completion:** The AST traversal modifications successfully wrap inline actions, allowing `scripts/test-swc.js` and RSC payload generation to pass without throwing serialization errors.

### Issue #7.2: Built-in Full-Stack Backend Support
- **Added:** Documentation, type definitions, and native scaffolding for API routes using `route.ts`.
- **Technical Details:**
  - **File-based Routing:** Intercepts `/api/*` requests and funnels them into the `typed-api-runtime.ts` execution pipeline.
  - **Next.js Parity:** Wraps native Express objects with compatible `NextRequest` and `NextResponse` primitives.
  - **HTTP Methods:** Supports mapping logic directly to HTTP verbs (`export async function GET`, `POST`, `PUT`, `DELETE`).
  - **Context API:** Exposes native backend context accessors, including `cookies()` and `headers()`.
  - **Impact:** Eliminates external backend infrastructure requirements, allowing developers to spin up full CRUD REST APIs (e.g., backed by Prisma) directly within the `app/` directory.
- **Proof of Completion:** Verified via `scripts/test-crud.js` which successfully executes `GET`, `POST`, `PUT`, and `DELETE` requests against the integrated `route.ts` API endpoints.

### Issue #7.3: Seamless Deployment Support
- **Added:** Native, zero-configuration deployment adapters for Vercel, Render, and Cloudflare Pages.
- **Technical Details:**
  - **Pipeline Overhaul:** The `deploy-output.ts` system now utilizes multi-target environment heuristics.
  - **Vercel Adapter:**
    - Auto-detects the environment (`process.env.VERCEL`).
    - Constructs a Serverless Function wrapper inside `.vercel/output/functions/index.func`.
    - Generates V3 routing rules within `config.json`.
  - **Render Adapter:**
    - Emits a standard `render.yaml` Blueprint file for automatic Node.js web service configuration.
  - **Cloudflare Adapter:**
    - Uses ESBuild to compile a standalone, edge-ready `_worker.js`.
    - Polyfills Node.js networking modules for strict Edge runtime compatibility.
- **Proof of Completion:** Build validations confirmed the successful generation of Vercel `config.json`, Cloudflare `_worker.js` edge bundles, and Render `render.yaml` blueprints across different target flags.

### Issue #7.4: AI-Native Application Framework
- **Added:** Native AI agent primitives exposed via the new `vista/ai` package export.
- **Technical Details:**
  - **Vercel AI SDK Integration:** Architected as a direct, seamless wrapper over `@ai-sdk/core`.
  - **Dynamic Resolution (`providers.ts`):** 
    - Utilizes lazy dynamic imports to avoid heavy static linking.
    - Gracefully degrades with clear CLI prompts instead of crashing when providers like `@ai-sdk/openai` are missing.
  - **Stateful Agents (`agent.ts`):** 
    - Introduces a new `agent(options)` primitive.
    - Internally manages multi-turn conversation history (`messages`), system prompts, and context.
    - Features native chunk streaming using `streamText` for real-time client responses.
- **Proof of Completion:** Validated using `scripts/test-ai.js`, which successfully loads the lazy dynamic providers and verifies the correct initialization of the AI agent primitives.

### Issue #7.5: Built-in Middleware System
- **Added:** Seamless support for chained, route-specific middleware via `app/**/middleware.ts`.
- **Technical Details:**
  - **Architecture Shift:** Replaced single-file global lookups with a recursive, depth-first filesystem pipeline (`middleware-runner.ts`).
  - **Deep Discovery:** Traverses `cwd` and `app/` on boot to register nested `middleware.{ts,tsx,js}` configurations.
  - **Auto-Matcher Synthesis:** 
    - Implicitly maps filesystem locations to RegExp URL prefixes.
    - Automatically strips route groups (e.g., `(auth)`).
    - Translates dynamic segment folders (e.g., `[id]`) to parameters (e.g., `:id`).
  - **Sequential Execution:** Executes matched middlewares "outside-in" (global first, specific routes second).
  - **State Management:** Accumulates and merges mutated response headers across the chain. Short-circuits immediately on non-200 responses, redirects, or rewrites.
- **Proof of Completion:** Verified through `scripts/test-middleware.js`, successfully logging expected sequential execution order (Global -> `/api` -> `(auth)` -> `[id]`) and accurately merging `responseHeaders` across nested layers.

## Local Development & Building

> [!WARNING]
> To keep the repository clean, the compiled framework output (`packages/vista/dist/`) is intentionally omitted from version control. 

If you are cloning this repository or pulling recent updates, you must compile the framework locally before testing it or using the deployment adapters:

```bash
# 1. Install dependencies
npm install

# 2. Build the Vista framework
npm run build -w @vistagenic/vista
```
Once the `dist/` folder is generated, all testing scripts and benchmarks will function as expected.
