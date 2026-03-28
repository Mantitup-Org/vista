---
category: "reference"
slug: "rust-crates-and-napi-bridge"
title: "Rust Crates and NAPI Bridge"
summary: "How Vista's Rust crates and `vista-napi` bridge are organized today, and how that differs from the larger Next.js Rust surface."
order: 77
updatedAt: "2026-03-27"
---

## Why Next.js Has More Rust Files

Next.js has spent years moving compiler, transform, bundler, tracing, and runtime work into Rust. That is why crates such as `next-api`, `next-core`, `next-custom-transforms`, and `crates/napi` contain many task-specific modules plus large fixture and regression suites.

Vista is on the same direction of travel, but it is earlier in that migration. Some public runtime behavior is already powered by Rust, while other pieces still live in TypeScript or in the newer Flashpack crates.

## What Vista's Top-Level Rust Crates Own

- `crates/vista-core`: shared runtime contracts such as engine, route, manifest, and platform types.
- `crates/vista-api`: Rust-facing app, route, project, and server-action descriptors.
- `crates/vista-build`: pipeline, output, engine, and standalone build planning contracts.
- `crates/vista-transforms`: client-directive detection, RSC scanning/manifest generation, lint helpers, and the new React compiler module surface.
- `crates/vista-napi`: the Node bridge that exposes Rust functionality into the JS runtime.

## What `vista-napi` Already Does

The current bridge is not fake. It exports working Rust functions that Vista already consumes or verifies:

- framework identity and integrity verification
- client directive detection
- route-tree extraction
- metadata detection
- RSC app scanning
- client and server manifest generation
- client mount-id generation
- client-component prerender helpers

## Where The Bridge Is Used

Today, the JS runtime loads `vista-napi` for fast route scanning, metadata checks, integrity verification, and RSC-oriented analysis. The broader Flashpack Rust pipeline also runs alongside that bridge for `flashpack` dev/build/start.

## Honest Status

Vista's Rust surface is now real and split into meaningful modules, but it is still smaller than Next.js in two ways:

- fewer years of implementation depth
- smaller fixture and regression coverage around each Rust subsystem

That means Vista has crossed out of the "single-file scaffold" stage, but it has not yet reached Next.js's full Rust breadth.

## Verification

Vista keeps this surface honest with repository tests that exercise:

- `cargo check --workspace`
- the `vista-napi` bridge directly
- Flashpack Rust pipeline artifacts in `.flash/`
- engine-parity RSC conformance across `default` and `flashpack`
