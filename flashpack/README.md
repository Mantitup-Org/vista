# Flashpack

Flashpack is Vista's Rust-first engine track.

Top-level layout mirrors the same architecture style used by the local `next.js` checkout:
- `crates/` for Rust engine crates
- `benchmark-apps/` for engine-focused fixtures
- `packages/` for JS bridge packages
- `scripts/` for tooling
- `xtask/` for repo automation

Runtime notes:
- Flashpack mode writes runtime/cache state to `.flash/` in the app root.
- Rust command orchestration runs through `flashpack-cli`.
- Phase graph files are emitted under `.flash/graph/`.
- Legacy cache folders from older engine experiments are cleaned when Flashpack boots.

Current crate groups:
- task graph: `flash-tasks`, `flash-tasks-backend`, `flash-tasks-env`, `flash-tasks-fetch`, `flash-tasks-fs`
- core engine: `flashpack`, `flashpack-core`, `flashpack-cli`, `flashpack-cli-utils`
- app/runtime: `flashpack-browser`, `flashpack-dev-server`, `flashpack-node`, `flashpack-nodejs`, `flashpack-static`
- asset/runtime transforms: `flashpack-css`, `flashpack-ecmascript`, `flashpack-ecmascript-hmr-protocol`, `flashpack-ecmascript-plugins`, `flashpack-ecmascript-runtime`, `flashpack-env`, `flashpack-image`, `flashpack-json`, `flashpack-mdx`, `flashpack-nft`, `flashpack-resolve`, `flashpack-swc-utils`, `flashpack-wasm`
- tracing/testing/support: `flashpack-analyze`, `flashpack-create-test-app`, `flashpack-test-utils`, `flashpack-tests`, `flashpack-trace-server`, `flashpack-trace-utils`, `flashpack-tracing`
