---
category: "reference"
slug: "flashpack-architecture"
title: "Flashpack Architecture"
summary: "Rust workspace layout and runtime flow for Vista Flashpack."
order: 76
updatedAt: "2026-03-20"
---

## What Flashpack Is

Flashpack is Vista's Rust-first engine track. It is the Vista equivalent of the Turbopack role in the Next.js ecosystem, with Vista naming and workflow.

## Top-Level Layout

- `flashpack/crates/`: Rust engine crates.
- `flashpack/benchmark-apps/`: benchmark apps focused on engine behavior.
- `flashpack/packages/`: JS bridge packages for tooling/runtime integration.
- `flashpack/scripts/`: operational tooling scripts.
- `flashpack/xtask/`: Rust automation task runner.

## Core Crate Groups

- Graph and tasks: `flash-tasks`, `flash-tasks-fs`
- Engine core: `flashpack-core`, `flashpack`
- Pipeline domains: `flashpack-ecmascript`, `flashpack-css`, `flashpack-resolve`
- Runtime layers: `flashpack-node`, `flashpack-nodejs`, `flashpack-browser`, `flashpack-dev-server`
- Targets: `flashpack-wasm`

## Workspace Wiring

The root Cargo workspace includes:

- Vista Rust crates (`crates/vista-*`)
- Flashpack crates (`flashpack/crates/*`)
- Flashpack task runner (`flashpack/xtask`)

This keeps the Rust graph unified for CI and local development.

## Runtime Artifacts

Flashpack runtime/cache artifacts are written to `.flash/`:

- `.flash/cache/` for cache data
- `.flash/graph/` for per-phase pipeline snapshots
- `.flash/logs/` for phase execution logs
- `.flash/state/latest.json` for current engine state

## CLI Surface

`create-vista-app` can scaffold projects for either engine mode:

- `default` (stable default path)
- `flashpack` (Rust-first path)

Generated scripts align to the selected mode (`vista dev`, `vista dev --flashpack`, etc.).
