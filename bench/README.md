# Vista Benchmarks

Vista keeps a broad benchmark matrix under `bench/*` and a shared runner in
`scripts/devlow-bench.mjs`.

## Fixture Matrix

- `app-router-server`
- `basic-app`
- `fuzzponent`
- `heavy-npm-deps`
- `module-cost`
- `nested-deps`
- `nested-deps-app-router`
- `nested-deps-app-router-many-pages`
- `vista-minimal-server`
- `recursive-copy`
- `recursive-delete`
- `rendering`
- `vercel`

Fixtures with `standard` runtime scripts participate in dev/build/start timing
runs. Utility fixtures are kept for parity and structure validation.

Bench fixtures are Vista-owned. Do not reintroduce upstream-only config files,
legacy build-output directories, upstream-specific env flags, or internal
upstream package imports under `bench/`.

## Engine Variants

Runner variants are Vista-first:

- `flashpack` (Rust-first runtime path)
- `default` (webpack-based path)

Legacy alias still works when passed manually:

- `webpack` -> `default`

## Commands

```bash
npm run bench:list
npm run bench:quick
npm run bench
```

```bash
node scripts/devlow-bench.mjs --mode all --runs 2 --requests 10
```

Useful flags:

- `--benchmarks <ids>`
- `--variants <ids>`
- `--mode <all|dev|build>`
- `--runs <n>`
- `--requests <n>`
- `--timeout <ms>`
- `--port-base <n>`
- `--json-out <path>`
- `--skip-install`
- `--list`

## Metrics and Output

Runner output includes startup, request, HMR, and build timing summaries where
applicable. JSON reports are written to `bench/results/devlow-*.json`.

## Guard Script

`npm run test:bench` validates:

- required benchmark directories
- required fixture files
- required runtime scripts for standard fixtures
- runner variant naming (`flashpack` and `default`)
