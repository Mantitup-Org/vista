---
category: "reference"
slug: "bench-architecture"
title: "Bench Architecture"
summary: "How Vista benchmark fixtures, runner modes, and validation checks are organized."
order: 5
updatedAt: "2026-03-20"
---

## Bench Directory Layout

- Benchmark fixtures live under `bench/*`.
- Result artifacts are written to `bench/results`.
- Structure checks are enforced by `scripts/test-bench.cjs`.

## Runner Design

- Runtime benchmark runner: `scripts/devlow-bench.mjs`.
- Modes:
- `dev`: startup, request, cache, HMR where supported.
- `build`: build, cache build, startup, request where supported.
- `all`: both `dev` and `build`.

## Standard vs Utility Fixtures

- Standard fixtures expose `dev/build/start` scripts and are timed directly.
- Utility fixtures are kept for parity coverage and validation, but can be skipped by runtime timing paths.

## Output

- JSON reports are generated in `bench/results/devlow-*.json`.
- Reports include per-benchmark raw timings and summary statistics.

## Adding A New Fixture

- Create a folder under `bench/<id>`.
- Add runtime scripts for standard fixtures:
- `dev-flashpack`, `dev-default`, `build-flashpack`, `build-default`, `start-flashpack`, `start-default`.
- Add representative fixture files and keep naming aligned with `app/layout.js` and `app/page.js` where applicable.
- Update `scripts/devlow-bench.mjs` benchmark metadata.
- Run `npm run test:bench` to verify structure guards.
