# Vista.js Developer Guide

Version: 0.2.16
Last updated: 2026-03-29
Repository: https://github.com/vistakit/Vista-Js.git
Primary site: https://vista.xyz/
Main package: `@vistagenic/vista`

This guide is the working map for contributors who need to understand how the repo fits together today. It is intentionally practical: what exists, where it lives, what must stay in sync, and which commands matter before you ship a change.

## 1. What Ships From This Repo

The repo currently ships two public npm packages:

- `@vistagenic/vista`: the framework package and `vista` CLI
- `create-vista-app`: the scaffolding CLI

The repo also contains internal/native pieces that support those packages:

- `vista-native`: the NAPI bridge package under `crates/vista-napi`
- top-level Rust crates under `crates/`
- the Rust-backed Flashpack engine under `flashpack/`
- the official docs/marketing site under `apps/web`

## 2. Branch and Release Model

- day-to-day work happens from `development`
- `main` is protected and merged via PR
- Lerna versioning/publish flow is configured to run from `development`

Relevant config:

- `lerna.json`
- root `package.json`

Typical maintainer release flow:

```bash
git add -A
git commit -m "release: x.y.z"
git push origin development
npx lerna publish from-package --yes
git tag vx.y.z
git push origin vx.y.z
```

## 3. Repository Map

```text
vista-source/
├── apps/
│   └── web/                    # official website/docs, built with Vista itself
├── bench/                      # Vista-only benchmark fixtures and runners
├── crates/                     # top-level Rust crates and NAPI bridge
├── flashpack/                  # Rust-backed Flashpack engine crates
├── packages/
│   ├── vista/                  # framework package and CLI
│   └── create-vista-app/       # scaffolding CLI
├── scripts/                    # test, conformance, guard, and benchmark helpers
├── CONTRIBUTING.md
├── README.md
├── developer.md
└── task.md                     # roadmap/execution ledger
```

## 4. Root Tooling

Root scripts live in `package.json`.

Important ones:

- `pnpm build`: workspace build through `scripts/flash-run.cjs`
- `pnpm dev`: workspace dev tasks
- `pnpm test`: full repo verification chain
- `pnpm test:integrity`: naming/integrity guard
- `pnpm test:rsc-conformance`: app-router and runtime conformance
- `pnpm test:vista-output`: `.vista` standalone/output verification
- `pnpm test:flashpack-dev`: Flashpack dev verification
- `pnpm test:flashpack-state`: Flashpack state reuse/cleanup verification
- `pnpm bench`: benchmark suite

The repo no longer uses `turbo.json` as the active workspace task definition. The active workspace runner is `scripts/flash-run.cjs` with `flashrepo.json`.

## 5. The `@vistagenic/vista` Package

Path: `packages/vista`

This package provides:

- the `vista` CLI via `bin/vista.js`
- framework exports for app/runtime usage
- server/client/runtime/build code under `src/`
- committed compiled output under `dist/`

### 5.1 Public exports

Current important exports include:

- `vista`
- `vista/link`
- `vista/image`
- `vista/navigation`
- `vista/font`
- `vista/theme`
- `vista/server`
- `vista/cache`
- `vista/stack`
- `vista/stack/client`

When you add or change a public surface, update:

- `packages/vista/package.json`
- matching `src/` implementation
- matching `dist/` output after rebuild

### 5.2 Key source folders

Path: `packages/vista/src`

- `bin/`: dev/build tooling, webpack config, scan/build entrypoints
- `build/`: manifests, standalone output helpers, RSC build helpers
- `client/`: client router, navigation, link, scripts, hydration helpers
- `server/`: engines, static generation, cache, boundary validation, alias resolution, PPR, actions
- `theme/`: package-level theme provider/script exports
- `flashpack/`: JS-side Flashpack command/runtime orchestration
- `stack/`: experimental typed API package surface
- `font/`, `image/`, `metadata/`, `router/`, `auth/`: framework subsystems

### 5.3 Important runtime/build files

A few files matter a lot because regressions there tend to fan out:

- `packages/vista/bin/vista.js`: user-facing CLI command routing
- `packages/vista/src/bin/build-rsc.ts`: RSC build pipeline and framework client reference scanning
- `packages/vista/src/server/rsc-engine.ts`: main RSC server runtime
- `packages/vista/src/server/rsc-upstream.ts`: upstream Flight/runtime path
- `packages/vista/src/server/static-generator.ts`: prerender/SSG path
- `packages/vista/src/server/project-alias-resolver.ts`: tsconfig alias resolution used by prerender/runtime
- `packages/vista/src/server/typed-api-runtime.ts`: route handler and metadata route resolution
- `packages/vista/src/theme/theme-provider.tsx`: package-level theme provider export
- `packages/vista/src/theme/theme-script.tsx`: early theme bootstrap script

### 5.4 File-based API routes

Route handlers (`app/**/route.{ts,tsx,js,jsx}`) are owned by four files:

- `src/server/route-patterns.ts` - pure parsing/matching of `[id]`, `[...slug]`,
  `[[...slug]]`, and `(group)` segments into the same `:name` / `:name*` patterns the
  page router emits. No filesystem, no express; this is the piece to unit test.
- `src/server/route-handler-registry.ts` - the single filesystem scan. Both the build
  scanner and the request-time resolver call it, which is what keeps the manifest and
  the runtime from disagreeing about which files are routes. Results are cached, with
  a short TTL in dev so new files appear without a restart.
- `src/server/typed-api-runtime.ts` - `resolveRouteHandlerMatch()` (static probe
  first, then the discovered table) and `runLegacyApiRoute()` (method dispatch,
  params, HEAD/OPTIONS/405).
- `src/build/rsc/server-manifest.ts` - emits `routeHandlers` into the server manifest,
  which `src/build/manifest.ts` turns into the `routeHandlers` array in
  `routes-manifest.json` and entries in `app-path-routes-manifest.json`.

Both engines share this path: `engine.ts` and `rsc-engine.ts` each call
`resolveRouteHandlerMatch()` before falling through to pages or the typed API, so a
change here lands on `default` and `flashpack` at once.

Two things are easy to get wrong:

- `scanForServerComponents()` in `server-manifest.ts` skips directories named `api`
  and treats every file it does find as a React component. Route handlers are
  therefore discovered separately, not by extending that walk.
- A page and a route handler cannot both own a URL. `generateAppPathRoutesManifest()`
  resolves that collision in favour of the page.

## 6. Engine Model

Vista currently has two main engine paths.

### 6.1 `default`

The default engine is the webpack-backed App Router/RSC pipeline. It is the main compatibility path and the one used by `apps/web` in normal local development unless overridden.

### 6.2 `flashpack`

Flashpack is the Rust-backed engine path. The CLI routes `vista dev`, `vista build`, and `vista start` into Flashpack when:

- `--engine flashpack`
- `--flashpack`
- `vista.config.ts` sets `engine.variant = 'flashpack'`

Flashpack records state in `.flash/`.

### 6.3 `--legacy`

Legacy SSR still exists behind `--legacy`, but most current parity work is on the RSC/app-router path.

## 7. `.vista` and `.flash`

### 7.1 `.vista`

Production builds emit `.vista/`, which now contains real non-empty artifacts:

- server manifests
- runtime manifests
- file-trace metadata
- standalone server output
- static pages and PPR shell artifacts
- cache/image/media manifests

If `.vista` ends up empty or missing critical manifests, treat that as a framework bug.

### 7.2 `.flash`

Flashpack emits `.flash/`, including:

- graph state
- runtime manifests
- logs
- state snapshots

Legacy `turbo`-named cache folders are not part of the active Vista output model anymore.

## 8. `create-vista-app`

Path: `packages/create-vista-app`

This package scaffolds new apps and currently supports:

- engine selection (`default` or `flashpack`)
- package-manager prompts/flags
- optional typed API starter
- shared base template under `template/`
- Flashpack overrides under `bin/flash-template/`

Important files:

- `packages/create-vista-app/bin/cli.js`
- `packages/create-vista-app/template/`
- `packages/create-vista-app/template-typed/`
- `packages/create-vista-app/bin/flash-template/`

When you change starter behavior, run:

```bash
pnpm test:create-vista-app
```

## 9. `apps/web`

Path: `apps/web`

This is the official site and docs app for `https://vista.xyz/`.

It is also a valuable framework integration test because it uses:

- `vista/theme`
- app metadata APIs
- docs dynamic routes
- metadata route files in `app/(seo)/`
- tsconfig aliases like `@/...`
- content collection imports

Important areas:

- `apps/web/app/root.tsx`: root layout, metadata, fonts, theme provider/script
- `apps/web/app/(seo)/`: `sitemap.ts`, `robots.ts`, `manifest.ts`
- `apps/web/app/docs/`: docs routes/layout/pages
- `apps/web/components/`: marketing/docs UI pieces
- `apps/web/utils/theme-toggle.tsx`: app-level theme toggle
- `apps/web/content/docs/`: MD/MDX docs source

If `apps/web` breaks in prerender or standalone mode, check both:

- project alias resolution
- metadata route resolution

## 10. Rust Surface

### 10.1 Top-level crates

Path: `crates/`

Current top-level crates include:

- `vista-api`
- `vista-build`
- `vista-build-test`
- `vista-core`
- `vista-error-code-swc-plugin`
- `vista-napi`
- `vista-taskless`
- `vista-transforms`
- `vista-wasm`

These are not one-file stubs anymore; they are split into task-oriented modules.

### 10.2 Flashpack crates

Path: `flashpack/`

Flashpack contains the Rust command/runtime side for the alternate engine path.

### 10.3 NAPI bridge

Path: `crates/vista-napi`

This is the Node bridge used for native helpers. When you change NAPI bindings or exported contracts, rebuild them:

```bash
npm --prefix crates/vista-napi run build
```

## 11. Testing Map

These are the most important scripts to know:

- `scripts/test-integrity.cjs`
- `scripts/test-rust-bridge.cjs`
- `scripts/test-create-vista-app-scaffold.cjs`
- `scripts/test-server-runtime.cjs`
- `scripts/test-api-routes.cjs`
- `scripts/test-use-cache.cjs`
- `scripts/test-segment-config.cjs`
- `scripts/test-advanced-runtime.cjs`
- `scripts/test-rsc-conformance.cjs`
- `scripts/test-vista-output.cjs`
- `scripts/test-flashpack-dev.cjs`
- `scripts/test-flashpack-state.cjs`
- `scripts/test-runtime-platform-gate.cjs`
- `scripts/test-bench.cjs`
- `scripts/test-bench-platform-gate.cjs`

When in doubt, `pnpm test` is the full confidence pass.

## 12. Publishing and Dist Sync

This repo commits package build output for `packages/vista/dist`.

That means:

- if you change `packages/vista/src`, rebuild `packages/vista`
- commit the matching `dist` changes
- do not publish stale `dist` output

Publishing is currently done via Lerna from `development`, but package-by-package `npm publish` remains a valid fallback when npm auth/Lerna behavior gets in the way.

## 13. Recent Gotchas Worth Remembering

### 13.1 Framework client manifest coverage

If you add a new client export under `packages/vista/src` and it compiles into `packages/vista/dist`, make sure the RSC client reference collector still sees it. A recent real bug happened because `vista/theme` client files were not being included in the React Client Manifest, which caused:

- first paint to appear
- then client hydration/runtime to break with missing manifest references

Current fix lives in `packages/vista/src/bin/build-rsc.ts`, which scans the full `dist` tree for framework client references.

### 13.2 Alias resolution must work in both prerender and runtime

`apps/web` uses aliases like `@/components/...` and imports like `content-collections`. Those must resolve correctly in:

- static prerender
- standalone runtime SSR
- RSC upstream paths

If you touch alias resolution, keep these in sync:

- `project-alias-resolver.ts`
- `static-generator.ts`
- `rsc-engine.ts`
- `rsc-upstream.ts`

### 13.3 Metadata route support is engine behavior, not just app code

The repo now expects metadata route files to work from app code, including route groups:

- `app/(seo)/sitemap.ts`
- `app/(seo)/robots.ts`
- `app/(seo)/manifest.ts`

If those stop resolving, look at `typed-api-runtime.ts` and route resolution logic, not just `apps/web`.

### 13.4 Keep-awake workflow should skip when no secret exists

The `Keep Deployment Awake` GitHub Action is configured to skip cleanly when `KEEP_AWAKE_URL`, `APP_URL`, and `RENDER_APP_URL` are all missing. If it fails hard again, check `.github/workflows/keep-render-awake.yml`.

## 14. Useful Commands

Install everything:

```bash
pnpm install
```

Build framework package:

```bash
npm --prefix packages/vista run build
```

Build docs site:

```bash
npm --prefix apps/web run build
```

Build native binding:

```bash
npm --prefix crates/vista-napi run build
```

Run full test chain:

```bash
pnpm test
```

Run only the website locally:

```bash
npm --prefix apps/web run dev
```

Run benchmark smoke:

```bash
pnpm bench:quick
```

## 15. If You Touch These Areas, Also Check These

- `packages/vista/src/server/*`
  - run `pnpm test:server-runtime`, `pnpm test:api-routes`, `pnpm test:rsc-conformance`, `pnpm test:vista-output`
- `packages/vista/src/flashpack/*`
  - run `pnpm test:flashpack-dev`, `pnpm test:flashpack-state`
- `packages/vista/src/theme/*`
  - rebuild package and verify `apps/web` no longer drops client content after hydration
- `packages/create-vista-app/*`
  - run `pnpm test:create-vista-app`
- `apps/web/*`
  - run `npm --prefix apps/web run build`
- `crates/*` or `crates/vista-napi/*`
  - run `cargo check --workspace` and rebuild NAPI if needed

## 16. Final Rule of Thumb

If something feels like "the app is broken", first ask which layer actually owns it:

- app code (`apps/web` or generated template)
- framework package runtime (`packages/vista/src/...`)
- committed dist/output drift (`packages/vista/dist`)
- alias/manifest/standalone integration
- native/Rust bridge behavior

Vista has moved past the one-file-stub stage. Most bugs now come from boundaries between those layers, so keeping the package exports, manifests, alias resolution, and committed build output in sync matters as much as the feature code itself.
