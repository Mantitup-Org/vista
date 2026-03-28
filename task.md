# Vista Execution Ledger

Status vocabulary: `pending`, `in-progress`, `done`, `blocked`

- [x] Task 1: Bench Decontamination
Status: `done`
Acceptance:
Remove `next.config.*` from `bench/`, strip `NEXT_*` / `.next` / `next/dist/*` / `packages/next` / `required-server-files` leftovers, keep only Vista-first fixture internals, and fail bench validation on banned legacy patterns.

- [x] Task 2: Server Actions + Cache Surface
Status: `done`
Acceptance:
Implement real `"use server"` support, action manifests and routing, `revalidateTag`, `unstable_cache`, and shared cache behavior across `default` and `flashpack`.

- [x] Task 3: App Router Tree Parity
Status: `done`
Acceptance:
Finish route groups, parallel routes, slot defaults, interception routes, and correct loading/error/not-found boundary behavior across the route tree.

Progress:
Route groups are URL-invisible, nested parallel slots/defaults render in HTML, RSC, and static generation, same-level interception routes render inside slots, and route-tree boundary handling now covers nested not-found and loading-oriented trees with engine-parity conformance.

- [x] Task 4: Segment Config + Boundary Enforcement
Status: `done`
Acceptance:
Support segment config exports (`dynamic`, `revalidate`, `runtime`, `preferredRegion`, `maxDuration`, `fetchCache`) and enforce client/server boundary rules in dev and build.

Progress:
Segment config exports are now parsed into emitted route metadata, merged across layout/page boundaries, enforced at runtime through request-scoped `fetchCache` policy, and validated in dev/build so invalid client/server imports, unsupported edge runtime usage, and invalid segment config literals fail with actionable errors.

- [x] Task 5: `.vista` Output Parity
Status: `done`
Acceptance:
Make `.vista` contain complete non-empty production artifacts, tracing/manifests, and standalone-friendly outputs with no hidden source-tree fallbacks.

Progress:
Production builds now emit standalone-friendly `.vista` artifacts with non-empty runtime manifests, file tracing metadata, rebased server/client manifests, and a working standalone server entry. Both `default` and `flashpack` start successfully from `.vista/standalone/server.js`, and output verification confirms runtime execution still works after the source `app/` tree is moved aside.

- [x] Task 6: Real Flashpack Execution
Status: `done`
Acceptance:
Replace the current prepare-and-fallback path with a distinct Rust-backed `flashpack` pipeline for `dev`, `build`, and `start`, backed by `.flash`.

Progress:
`vista dev/build/start --engine flashpack` now routes through a Rust `flashpack-cli` command path that scans the project, emits `.flash` graph/runtime/state manifests, and launches a dedicated Flashpack runner instead of entering the default JS CLI flow directly. Both production output checks and RSC conformance continue to pass through that Rust-owned path, and `.flash` now records real build/start manifests owned by `rust-cli`.

- [x] Task 7: Cross-Platform Hardening
Status: `done`
Acceptance:
Harden spawn-permission failure paths for RSC/SSG/Flashpack and verify both engines on Windows and Linux before macOS.

Progress:
Spawn-permission detection is now centralized and shared, static generation still degrades safely, the main RSC engine no longer hard-crashes when the upstream React server cannot be spawned, Flashpack boot cleans legacy cache state before running, and standalone RSC startup survives Windows-specific file-URL edge cases by normalizing drive-letter casing plus empty-hash/default-export client references across both the client and server-consumer manifests. Verification is now enforced by a dedicated Windows/Linux runtime platform gate workflow plus a runtime gate script that runs integrity, hardening, standalone output, RSC conformance, Flashpack dev, and Flashpack state-reuse checks on both platforms.

- [x] Task 8: Conformance Matrix Expansion
Status: `done`
Acceptance:
Add dedicated Vista conformance coverage for server actions, cache/revalidation, route groups, parallel/interception routes, route handlers, metadata, boundary behavior, and engine parity.

Progress:
Engine-parity conformance now covers server actions, cache invalidation, route groups, nested parallel slot rendering/defaults, interception slot rendering, loading-tree parity, slot-boundary not-found behavior, route-handler JSON responses, dynamic-route metadata output, merged segment-config manifest output, request-scoped `fetchCache` behavior, invalid boundary/config build failures, production standalone `.vista` startup/output behavior across both `default` and `flashpack`, manifest aliasing for named/default/empty-hash client references, Flashpack Rust-pipeline output verification through `.flash` build/start manifests, Flashpack dev/restart coverage, and dedicated Flashpack state-reuse checks that verify stale legacy cache folders are cleaned before build/start reuse.

- [x] Task 9: CLI and Template Polish
Status: `done`
Acceptance:
Keep engine selection polished, remove stale legacy cache terminology from generated apps, and make `.vista` / `.flash` outputs understandable to contributors.

Progress:
`create-vista-app` now keeps generated `dev` / `build` / `start` scripts engine-agnostic (`vista dev`, `vista build`, `vista start`) while persisting the selected engine in `vista.config.ts`. Generated app README content now records the chosen engine and typed-API starter state, scaffolded `.gitignore` no longer includes stale `.next/` cache terminology, and scaffold verification now exercises both default and flashpack project creation paths.

- [x] Task 10: Benchmark and Docs Refinement
Status: `done`
Acceptance:
Document Vista-only benchmark rules, banned legacy patterns, and `flashpack` vs `default` interpretation in Markdown docs.

Progress:
Main web docs now describe config-driven engine selection, Flashpack/default script behavior, and the current Rust crate plus `vista-napi` bridge layout. The docs surface now explains why Vista's Rust layer is smaller than Next.js today, what parts are already real and tested, and where engine selection lives for both contributors and generated apps.

- [x] Task 11: Advanced Runtime Surface
Status: `done`
Acceptance:
Defer edge runtime, PPR, advanced cache-component semantics, and deeper tracing/devtools parity until the must-have parity tasks are stable.

Progress:
Advanced runtime scope for this roadmap is now complete: Vista supports config-gated `"use cache"` cache components through `experimental.cacheComponents.enabled`, runtime cache tagging/lifetime helpers (`cacheTag`, `cacheLife`), compile-hook wrapping for both cached module exports and inline/function-level cached helpers, validator errors when the feature is disabled or used in client modules, and conformance coverage that proves cached server pages stay stable until tag-based invalidation refreshes them across both `default` and `flashpack`. Vista also supports `runtime = 'edge'` for App Router `route.*` handlers, executing them through a real Web `Request`/`Response` path with runtime-trace response headers, while broader page/layout edge parity remains future expansion rather than a blocker for this milestone. PPR now emits loading-boundary shell artifacts into `.vista/static/pages/*.shell.html`, records partial-prerender metadata in `prerender-manifest.json`, persists that metadata through the static cache, embeds a client-side resume bootstrap in the shell artifact, supports explicit `shell` and `resume` request modes through the `x-vista-prerender` header, and prefers a client-side RSC router resume bridge before falling back to server HTML resume. Deeper tracing/devtools parity is also in place for these advanced-runtime flows: the runtime now records trace events, the PPR shell emits completion/error lifecycle events, the RSC router emits resume start/complete/error events, and the Vista devtools indicator reacts to those events for advanced-runtime visibility. Verification now includes advanced-runtime tracing checks plus engine-parity conformance, output, dev, integrity, and bench coverage.
