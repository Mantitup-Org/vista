---
category: "reference"
slug: "engine-variants-default-vs-flashpack"
title: "Engine Variants: Default vs Flashpack"
summary: "How benchmark and CLI engine variants map to Vista runtime paths."
order: 6
updatedAt: "2026-03-20"
---

## Variant Names

- `flashpack`: Rust-first runtime path.
- `default`: webpack-based runtime path.

## Bench Script Mapping

- Standard fixture scripts: `dev-flashpack`, `build-flashpack`, `start-flashpack`
- Standard fixture scripts: `dev-default`, `build-default`, `start-default`

## CLI Selection

- `create-vista-app` supports `default` and `flashpack` engine selection.
- Generated apps always use `vista dev` / `vista build` / `vista start`.
- The engine choice is written into `vista.config.ts`, and the Vista CLI resolves `default` or `flashpack` from that config at runtime.
- Flashpack runtime/cache artifacts are written to `.flash/`.

## Compatibility Aliases

- `webpack` is treated as an alias of `default`.

## Why This Exists

- Keeps Vista-first naming in contributor workflows.
- Keeps generated apps stable even when teams switch engines later.
