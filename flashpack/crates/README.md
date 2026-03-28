# Flashpack Crates

This crate tree is intentionally expanding toward the same kind of multi-crate
surface used by the local `next.js` Rust engine workspace.

Current groups:

- task graph: `flash-tasks`, `flash-tasks-backend`, `flash-tasks-env`, `flash-tasks-fetch`, `flash-tasks-fs`
- engine core: `flashpack`, `flashpack-core`, `flashpack-cli`, `flashpack-cli-utils`
- runtime and servers: `flashpack-browser`, `flashpack-dev-server`, `flashpack-node`, `flashpack-nodejs`, `flashpack-static`
- transforms and assets: `flashpack-css`, `flashpack-ecmascript`, `flashpack-ecmascript-hmr-protocol`, `flashpack-ecmascript-plugins`, `flashpack-ecmascript-runtime`, `flashpack-env`, `flashpack-image`, `flashpack-json`, `flashpack-mdx`, `flashpack-nft`, `flashpack-resolve`, `flashpack-swc-utils`, `flashpack-wasm`
- tracing and tests: `flashpack-analyze`, `flashpack-create-test-app`, `flashpack-test-utils`, `flashpack-tests`, `flashpack-trace-server`, `flashpack-trace-utils`, `flashpack-tracing`

These crates are still scaffold-level in several areas, but the repo shape is
now ready for deeper Rust implementation work without inventing new layout
decisions later.
