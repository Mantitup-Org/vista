# Vista JS — Complete Developer Guide

> **Version**: 0.1.0  
> **Last Updated**: March 4, 2026  
> **Package**: `@vistagenic/vista`  
> **Repo**: `https://github.com/vistagen/Vista-Js`  
> **License**: MIT

This document is the **single source of truth** for any developer working on the Vista JS framework.
It covers every directory, every file worth knowing, every command, the Rust crate integration,
the RSC (React Server Components) architecture, and known gotchas. Read it end-to-end before
touching any code.

---

## Table of Contents

1.  [What is Vista JS?](#1-what-is-vista-js)
2.  [Prerequisites](#2-prerequisites)
3.  [Repository Structure](#3-repository-structure)
4.  [Monorepo Tooling](#4-monorepo-tooling)
5.  [Getting Started — First-Time Setup](#5-getting-started--first-time-setup)
6.  [Core Package: `@vistagenic/vista`](#6-core-package-vistagenicvista)
7.  [CLI (`bin/vista.js`)](#7-cli-binvistajs)
8.  [Build System](#8-build-system)
9.  [Server Engines](#9-server-engines)
10. [RSC Upstream (Flight Server)](#10-rsc-upstream-flight-server)
11. [Client Runtime](#11-client-runtime)
12. [Metadata System](#12-metadata-system)
13. [Font System](#13-font-system)
14. [Routing & File Conventions](#14-routing--file-conventions)
15. [Structure Validator](#15-structure-validator)
16. [Dev Error Overlay](#16-dev-error-overlay)
17. [SSE Live-Reload](#17-sse-live-reload)
18. [Rust Crates](#18-rust-crates)
19. [NAPI Bindings](#19-napi-bindings)
20. [Constants & Naming System](#20-constants--naming-system)
21. [Rename Prevention & Integrity Guard](#21-rename-prevention--integrity-guard)
22. [Create-Vista-App Scaffolding CLI](#22-create-vista-app-scaffolding-cli)
23. [Test Suite](#23-test-suite)
24. [All Commands Reference](#24-all-commands-reference)
25. [Key Files Quick Reference](#25-key-files-quick-reference)
26. [Architecture Diagrams](#26-architecture-diagrams)
27. [Common Development Workflows](#27-common-development-workflows)
28. [Bug Bounty & Debugging Guide](#28-bug-bounty--debugging-guide)
29. [Rust Setup & Native Build](#29-rust-setup--native-build)
30. [Known Issues & Gotchas](#30-known-issues--gotchas)
31. [Deployment](#31-deployment)
32. [Contributing Checklist](#32-contributing-checklist)
33. [Typed API (Experimental, Package-First)](#33-typed-api-experimental-package-first)

---

## 1. What is Vista JS?

Vista JS is a **React 19 full-stack framework** — a Next.js competitor — with:

- **True React Server Components (RSC)** via `react-server-dom-webpack`
- **Rust-powered file scanning** via NAPI bindings (10–100× faster than JS)
- **Dual engine**: RSC (default) + Legacy SSR (via `--legacy` flag)
- **Webpack 5** for client bundling with Flight plugin integration
- **Express** for the dev/production HTTP server
- **PostCSS + Tailwind CSS v4** for styling
- **Google Fonts loader** (Next.js-compatible API)
- **`create-vista-app`** scaffolding CLI

The framework follows Next.js App Router conventions:

- `app/` directory structure
- `root.tsx` (or `layout.tsx`) as root layout
- `page.tsx` / `index.tsx` for routes
- `'use client'` directive for client components
- `metadata` / `generateMetadata` exports for SEO

---

## 2. Prerequisites

| Tool       | Version     | Notes                                     |
| ---------- | ----------- | ----------------------------------------- |
| Node.js    | ≥ 20.0.0    | Required (uses ES2020+ features)          |
| pnpm       | 8.15.0      | Package manager (set in `packageManager`) |
| Rust       | stable      | For native NAPI bindings (optional)       |
| Cargo      | (with Rust) | Builds `vista-transforms` + `vista-napi`  |
| Turbo      | ≥ 2.0.0     | Monorepo task runner                      |
| TypeScript | ≥ 5.7       | Compilation of `packages/vista/src/`      |

---

## 3. Repository Structure

```
vista-source/                          # ← Root of the monorepo
├── package.json                       # Root workspace config (Turbo scripts)
├── pnpm-workspace.yaml                # Workspace packages: packages/*, apps/*, crates/*
├── flashrepo.json                         # Flashrepo task definitions (build, dev, lint, test, clean)
├── Cargo.toml                         # Rust workspace root (vista-transforms + vista-napi)
├── rust-toolchain.toml                # Rust stable channel + targets
├── tsconfig.json                      # Root TypeScript config
├── eslint.config.mjs                  # ESLint flat config
├── lint-staged.config.mjs             # Pre-commit lint-staged config
│
├── packages/
│   ├── vista/                         # ★ CORE FRAMEWORK PACKAGE
│   │   ├── package.json               # @vistagenic/vista — exports, bin, deps
│   │   ├── tsconfig.json              # TypeScript config for the framework
│   │   ├── bin/
│   │   │   └── vista.js               # CLI entry: dev, build, start
│   │   ├── src/                       # ★ SOURCE CODE — this is where you work
│   │   │   ├── index.ts               # Main exports (types, config)
│   │   │   ├── react-server.ts        # react-server condition export
│   │   │   ├── config.ts              # Vista config loader + types
│   │   │   ├── dev-error.tsx           # Dev error overlay (HTML + React)
│   │   │   ├── image.tsx              # <Image> component
│   │   │   ├── auth/                  # Authentication helpers
│   │   │   ├── bin/                   # Build scripts
│   │   │   │   ├── build.ts           # Legacy SSR build pipeline
│   │   │   │   ├── build-rsc.ts       # RSC build pipeline (dual webpack)
│   │   │   │   ├── file-scanner.ts    # App directory scanner (Rust NAPI + JS fallback)
│   │   │   │   └── webpack.config.ts  # Legacy webpack config
│   │   │   ├── build/                 # Build utilities
│   │   │   │   ├── manifest.ts        # VistaDirs, buildId, cache config
│   │   │   │   ├── rsc/               # RSC-specific build
│   │   │   │   │   ├── compiler.ts    # createServerWebpackConfig + createClientWebpackConfig
│   │   │   │   │   ├── server-manifest.ts   # Server component manifest generator
│   │   │   │   │   ├── client-manifest.ts   # Client component manifest generator
│   │   │   │   │   ├── component-identity.ts # Component ID generation
│   │   │   │   │   ├── native-scanner.ts    # Rust NAPI scanner bridge
│   │   │   │   │   └── index.ts
│   │   │   │   └── webpack/           # Webpack plugins/loaders
│   │   │   ├── client/                # Client-side runtime
│   │   │   │   ├── rsc-router.tsx     # RSC client router (Flight-based navigation)
│   │   │   │   ├── server-actions.ts  # callServer + useActionState + useFormStatus
│   │   │   │   ├── link.tsx           # <Link> component
│   │   │   │   ├── router.tsx         # Legacy router
│   │   │   │   ├── navigation.ts      # useRouter, usePathname, useSearchParams
│   │   │   │   ├── dynamic.tsx        # dynamic() import helper
│   │   │   │   ├── script.tsx         # <Script> component
│   │   │   │   ├── head.tsx           # <Head> component (client)
│   │   │   │   ├── head.react-server.tsx # <Head> (server)
│   │   │   │   ├── hydration.ts       # Hydration utilities
│   │   │   │   └── font.tsx           # Font client component
│   │   │   ├── components/            # Built-in components
│   │   │   ├── font/                  # Font system
│   │   │   │   ├── google.ts          # Google Font loader (Inter, Roboto, etc.)
│   │   │   │   ├── local.ts           # Local font loader
│   │   │   │   ├── registry.ts        # Font registry (registerFont, getFontHeadHTML)
│   │   │   │   └── index.ts
│   │   │   ├── image/                 # Image optimization
│   │   │   ├── metadata/              # Metadata system
│   │   │   │   ├── generate.tsx       # generateMetadataHtml() + React element generation
│   │   │   │   ├── types.ts           # Metadata, OpenGraph, Twitter, etc. types
│   │   │   │   └── index.ts
│   │   │   ├── router/                # Router internals
│   │   │   ├── server/                # ★ SERVER ENGINES
│   │   │   │   ├── rsc-engine.ts      # RSC Web Engine (Express + Flight SSR)
│   │   │   │   ├── rsc-upstream.ts    # RSC Flight upstream (runs with react-server condition)
│   │   │   │   ├── engine.ts          # Legacy SSR engine
│   │   │   │   ├── root-resolver.ts   # Resolves root layout + not-found component
│   │   │   │   ├── logger.ts          # Console logging with colors + timing
│   │   │   │   ├── not-found-page.ts  # Styled 404 fallback HTML page
│   │   │   │   ├── structure-validator.ts  # App structure validation
│   │   │   │   ├── structure-watch.ts # Live structure watching in dev
│   │   │   │   ├── structure-log.ts   # Structure validation log formatting
│   │   │   │   ├── middleware-runner.ts # Middleware execution
│   │   │   │   ├── image-optimizer.ts # Image optimization endpoint
│   │   │   │   ├── static-cache.ts    # Static file serving with cache
│   │   │   │   ├── static-generator.ts # Static page generation
│   │   │   │   ├── artifact-validator.ts # Build artifact validation
│   │   │   │   ├── client-boundary.ts # Client boundary detection
│   │   │   │   └── index.ts
│   │   │   └── types/                 # TypeScript type definitions
│   │   └── dist/                      # ★ COMPILED OUTPUT (tsc)
│   │
│   └── create-vista-app/              # Scaffolding CLI
│       ├── package.json               # create-vista-app package
│       ├── bin/
│       │   └── cli.js                 # CLI: npx create-vista-app@latest
│       └── template/                  # Project template
│           ├── app/
│           │   ├── root.tsx           # Default root layout
│           │   ├── index.tsx          # Default home page
│           │   └── globals.css        # Tailwind CSS v4 globals
│           ├── public/                # Static assets
│           ├── postcss.config.mjs     # PostCSS config
│           ├── tsconfig.json          # TypeScript config
│           ├── vista-env.d.ts         # Vista type declarations
│           └── vista.config.ts        # Vista configuration
│
├── crates/                            # ★ RUST NATIVE CODE
│   ├── vista-transforms/              # Pure Rust SWC transforms
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs                 # Re-exports client_directive + rsc + naming
│   │       ├── client_directive.rs    # 'use client' detection
│   │       ├── naming.rs             # ★ Framework naming constants + integrity token
│   │       └── rsc/
│   │           ├── mod.rs             # RSC module entry
│   │           ├── scanner.rs         # App directory scanner
│   │           ├── manifest.rs        # Client/Server manifest generation
│   │           ├── serializer.rs      # RSC payload serialization
│   │           └── prerender.rs       # Client component prerendering
│   │
│   └── vista-napi/                    # Node.js NAPI bindings
│       ├── Cargo.toml
│       ├── build.rs                   # NAPI build script
│       ├── src/
│       │   └── lib.rs                 # NAPI function exports (JS ↔ Rust bridge)
│       ├── index.js                   # JS loader for the .node binary
│       ├── index.d.ts                 # TypeScript declarations
│       └── vista-native.win32-x64-msvc.node  # Compiled binary (Windows x64)
│
├── apps/                              # Website apps
│   ├── web/                           # Vista website (apps/web)
│   └── components/                    # Shared website components
│
├── scripts/                           # CI/CD + test scripts
│   ├── test-regression.cjs            # Phase 1 regression tests (32 tests)
│   ├── test-vista-hardening.cjs       # Hardening integration tests
│   ├── test-integrity.cjs             # ★ Rename prevention integrity guard (48 checks)
│   ├── test-constants.cjs             # Shared naming constants for test scripts
│   └── check-create-vista-command.cjs # Guard: validate CLI command usage
│
├── test-app/                          # ★ LOCAL TEST APPLICATION
│   ├── app/
│   │   ├── root.tsx                   # Root layout with Geist fonts
│   │   ├── index.tsx                  # Home page with Counter
│   │   ├── Counter.tsx                # 'use client' component (useState + useEffect)
│   │   ├── globals.css                # Tailwind v4 + dark mode
│   │   └── about/
│   │       └── page.tsx               # About page (nested route test)
│   └── public/                        # Static assets (vista.svg etc.)
│
└── target/                            # Rust build output (cargo)
    ├── debug/                         # Debug builds
    └── release/                       # Release builds (LTO enabled)
```

---

## 4. Monorepo Tooling

### pnpm Workspaces

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*' # vista, create-vista-app
  - 'apps/*' # web (docs website)
  - 'crates/*' # Rust crates (for pnpm to track)
```

### Turborepo

```jsonc
// flashrepo.json — task pipeline
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".vista/**", "*.node"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["build"], "outputs": ["coverage/**"] },
    "clean": { "cache": false },
  },
}
```

### Root Scripts

| Script                            | Command                                       | Purpose                                            |
| --------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| `pnpm build`                      | `node scripts/flash-run.cjs run build`         | Build all packages                                 |
| `pnpm dev`                        | `node scripts/flash-run.cjs run dev`           | Dev mode for all packages                          |
| `pnpm lint`                       | `eslint .`                                    | Lint entire monorepo                               |
| `pnpm lint:fix`                   | `eslint . --fix`                              | Auto-fix lint errors                               |
| `pnpm format`                     | `prettier --write .`                          | Format all files                                   |
| `pnpm format:check`               | `prettier --check .`                          | Check formatting                                   |
| `pnpm test`                       | Full test pipeline                            | Turbo + guard + integrity + hardening + regression |
| `pnpm test:integrity`             | `node scripts/test-integrity.cjs`             | Rename prevention guard (48 checks)                |
| `pnpm test:hardening`             | `node scripts/test-vista-hardening.cjs`       | Hardening suite                                    |
| `pnpm test:regression`            | `node scripts/test-regression.cjs`            | Regression suite (32 tests)                        |
| `pnpm guard:create-vista-command` | `node scripts/check-create-vista-command.cjs` | Validate CLI usage in docs                         |

---

## 5. Getting Started — First-Time Setup

### Bash (Linux / macOS / Git Bash on Windows)

```bash
# 1. Clone the repo
git clone https://github.com/vistagen/Vista-Js.git vista-source
cd vista-source

# 2. Install dependencies
pnpm install

# 3. Build the framework
cd packages/vista
npx tsc
cd ../..

# 4. (Optional) Build Rust native bindings — see Section 27
cargo build --release

# 5. Create a test app
mkdir test-app && cd test-app
npx create-vista-app@latest . --local    # --local links to local packages/vista
# OR manually:
pnpm init
pnpm add ../packages/vista react@^19 react-dom@^19 react-server-dom-webpack@^19 \
  tailwindcss@^4 postcss @tailwindcss/postcss @swc-node/register tsx

# 6. Run the dev server
npx vista dev
# → http://localhost:3003
```

### PowerShell (Windows)

```powershell
# 1. Clone the repo
git clone https://github.com/vistagen/Vista-Js.git vista-source
Set-Location vista-source

# 2. Install dependencies
pnpm install

# 3. Build the framework
Set-Location packages\vista
npx tsc
Set-Location ..\..

# 4. (Optional) Build Rust native bindings — see Section 27
cargo build --release

# 5. Create a test app
New-Item -ItemType Directory test-app -Force
Set-Location test-app
npx create-vista-app@latest . --local
# OR manually set up

# 6. Run the dev server
npx vista dev
# → http://localhost:3003

# 7. Kill all node processes (useful when Ctrl+C doesn't clean up)
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
```

---

## 6. Core Package: `@vistagenic/vista`

### package.json Key Fields

```jsonc
{
  "name": "@vistagenic/vista",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": { "vista": "./bin/vista.js" },
  "exports": {
    ".": "dist/index.js", // Main entry
    "./link": "dist/client/link.js", // <Link>
    "./image": "dist/image/index.js", // <Image>
    "./router": "dist/client/router.js", // Legacy router
    "./navigation": "dist/client/navigation.js", // useRouter, usePathname
    "./dynamic": "dist/client/dynamic.js", // dynamic()
    "./script": "dist/client/script.js", // <Script>
    "./font": "dist/font/index.js", // Font base
    "./font/google": "dist/font/google.js", // Google Fonts
    "./font/local": "dist/font/local.js", // Local fonts
    "./head": "dist/client/head.js", // <Head>
    "./config": "dist/config.js", // Config loader
    "./client/rsc-router": "dist/client/rsc-router.js", // RSC router
    "./client/server-actions": "dist/client/server-actions.js", // Server actions
  },
}
```

### Dependencies

| Package                                | Version | Purpose                              |
| -------------------------------------- | ------- | ------------------------------------ |
| `react`                                | ^19.0.0 | React 19 (Server Components support) |
| `react-dom`                            | ^19.0.0 | React DOM rendering                  |
| `react-server-dom-webpack`             | ^19.0.0 | Flight protocol (RSC wire format)    |
| `webpack`                              | ^5.90.0 | Client bundler                       |
| `webpack-dev-middleware`               | ^7.0.0  | Dev-mode file serving from memory    |
| `webpack-hot-middleware`               | ^2.26.0 | HMR (legacy mode only)               |
| `@pmmmwh/react-refresh-webpack-plugin` | ^0.5.11 | React Refresh (legacy mode only)     |
| `express`                              | ^4.21.2 | HTTP server                          |
| `swc-loader`                           | ^0.2.6  | SWC-based webpack loader             |
| `@swc/core`                            | ^1.4.0  | SWC compiler                         |
| `css-loader`                           | ^7.1.2  | CSS Modules support                  |
| `mini-css-extract-plugin`              | ^2.9.4  | CSS extraction                       |
| `null-loader`                          | ^4.0.1  | Ignores non-module CSS in webpack    |
| `esbuild`                              | ^0.24.2 | Fast JS transforms                   |
| `chokidar`                             | ^3.6.0  | File watching                        |
| `react-refresh`                        | ^0.14.0 | React Fast Refresh runtime           |

### Building the Framework

Every time you change files in `packages/vista/src/`, you need to rebuild:

```bash
# Bash
cd packages/vista && npx tsc

# PowerShell
Set-Location packages\vista; npx tsc
```

Output goes to `packages/vista/dist/`. The `bin/vista.js` CLI imports from `../dist/`.

---

## 7. CLI (`bin/vista.js`)

The CLI is the entry point for all Vista commands.

```
Usage: vista <command> [options]

Commands:
  dev     Start development server with live-reload
  build   Create production build
  start   Start production server

Options:
  --legacy    Use Legacy SSR mode instead of RSC (or set VISTA_LEGACY=true)
```

### Internal Flow

```
vista dev
  │
  ├─ --legacy?
  │    ├─ YES → buildClient(true) → startServer(port, compiler)     [engine.ts]
  │    └─ NO  → buildRSC(true)    → startRSCServer({ port, compiler }) [rsc-engine.ts]
  │
vista build
  │
  ├─ --legacy?
  │    ├─ YES → buildClient(false)
  │    └─ NO  → buildRSC(false)
  │
vista start
  │
  ├─ --legacy?
  │    ├─ YES → startServer(port)
  │    └─ NO  → startRSCServer({ port })
```

Default port: `3003` (configurable via `PORT` env var or `vista.config.ts`)

---

## 8. Build System

### RSC Build Pipeline (`build-rsc.ts`)

When you run `vista dev` or `vista build` (without `--legacy`):

```
buildRSC(isDev)
  │
  ├─ 1. Create .vista/ directory structure
  │       .vista/
  │         ├── server/app/          # Server webpack output
  │         ├── static/chunks/       # Client webpack output (served at /_vista/static/chunks/)
  │         ├── rsc-client.tsx       # Auto-generated client entry
  │         ├── client.css           # PostCSS output
  │         ├── react-client-manifest.json   # Flight client manifest
  │         ├── react-server-manifest.json   # Flight SSR manifest
  │         ├── client-manifest.json         # Vista client component manifest
  │         └── server/server-manifest.json  # Vista server component manifest
  │
  ├─ 2. Validate app structure (validateAppStructure)
  │
  ├─ 3. Scan app/ directory (scanAppDirectory — Rust NAPI or JS fallback)
  │       → Finds all client components ('use client')
  │       → Finds all server components
  │       → Builds route tree
  │
  ├─ 4. Run PostCSS (globals.css → .vista/client.css)
  │       npx postcss app/globals.css -o .vista/client.css
  │
  ├─ 5. Generate RSC client entry (.vista/rsc-client.tsx)
  │       → Imports React, hydrateRoot, createFromFetch, RSCRouter
  │       → SSE live-reload listener (/__vista_reload)
  │
  ├─ 6. Create Server Webpack Config (createServerWebpackConfig)
  │       → target: node, commonjs2
  │       → Bundles all app code for SSR
  │       → Output: .vista/server/app/
  │
  ├─ 7. Create Client Webpack Config (createClientWebpackConfig)
  │       → target: web
  │       → Only bundles 'use client' components
  │       → ReactFlightWebpackPlugin generates manifests
  │       → SplitChunks: webpack.js, framework.js, vendor.js, client*.js
  │       → Output: .vista/static/chunks/
  │
  └─ 8. Run webpack (watch mode in dev, single run in build)
```

### Client Webpack Config Highlights

```typescript
{
  mode: isDev ? 'development' : 'production',
  target: 'web',
  entry: clientEntry,                    // .vista/rsc-client.tsx
  cache: false,                          // Avoids Flight serializer warnings
  optimization: {
    splitChunks: {
      cacheGroups: {
        framework: { test: /react|react-dom|scheduler/, name: 'framework' },
        vendor:    { test: /node_modules/,              name: 'vendor' },
      },
    },
    runtimeChunk: { name: 'webpack' },   // Separate webpack runtime
  },
  plugins: [
    ReactFlightWebpackPlugin({           // Generates Flight manifests
      isServer: false,
      clientManifestFilename: 'react-client-manifest.json',
      serverConsumerManifestFilename: 'react-server-manifest.json',
    }),
    VistaSSRManifestPatch,               // Transforms {specifier,name} → {id,chunks,name}
    DefinePlugin,                        // NODE_ENV, __VISTA_BUILD_ID__, __VISTA_SERVER__
    MiniCssExtractPlugin,                // CSS Modules extraction
  ],
  // NOTE: No HotModuleReplacementPlugin or ReactRefreshWebpackPlugin in RSC mode!
  // Vista uses SSE live-reload instead.
}
```

### Script Load Order

The order of `<script>` tags in HTML matters:

```
webpack.js        → Webpack runtime (__webpack_require__)
framework.js      → React + React DOM
vendor.js         → Other node_modules
client0.js        → Client component chunks
main.js           → Entry point (hydration + RSCRouter)
```

This is enforced by `findChunkFiles()` in `rsc-engine.ts`.

---

## 9. Server Engines

### RSC Engine (`rsc-engine.ts`) — Default

The main server for RSC mode. ~1530 lines.

**Architecture**:

```
Browser ────────────────────────── RSC Engine (port 3003) ──────── RSC Upstream (port 3004)
                                        │                                │
  GET /                                 │                                │
  → Express receives request            │                                │
  → Fetches Flight stream from ──── GET /rsc/ ─────────────────────→ Express
  ← renderToPipeableStream ←── Flight binary stream (text/x-component) ←─┘
  → Injects <head>, <script>, CSS
  → Sends full HTML to browser
                                        │
  GET /rsc/about                        │
  → Proxied to upstream ───────────→ GET /rsc/about
  ← Flight stream returned ←──────── text/x-component
  → Browser decodes with createFromFetch
```

**Key functions**:

| Function                        | Line | Purpose                                                              |
| ------------------------------- | ---- | -------------------------------------------------------------------- |
| `startRSCServer(options)`       | ~793 | Main entry: creates Express, spawns upstream, sets up everything     |
| `spawnUpstream(cwd, port)`      | ~591 | Launches `rsc-upstream.js` child process                             |
| `renderFlightToHTMLStream(...)` | ~617 | Fetches Flight → decodes → renderToPipeableStream → HTML             |
| `findChunkFiles(cwd)`           | ~278 | Discovers JS chunks with proper load order                           |
| `cleanHotUpdateFiles(cwd)`      | ~268 | Removes stale HMR artifacts on startup                               |
| `createHtmlDocument(...)`       | ~470 | Builds full HTML with metadata, fonts, scripts                       |
| `wrapInDocumentShell(...)`      | ~730 | Wraps content when root layout doesn't provide `<html>`              |
| `handleApiRoute(...)`           | ~520 | API route handler (`app/api/`)                                       |
| Shutdown handler                | ~937 | Graceful cleanup: kill upstream, close watcher, end SSE, stop server |

**Features**:

- Webpack dev-middleware (`/_vista/static/chunks/`)
- SSE live-reload (`/__vista_reload`)
- PostCSS output serving (`/_vista/client.css`)
- CSS Modules serving (`/_vista/static/chunks/modules.css`)
- Static file serving (`/public/`)
- Flight stream proxy (`/rsc/*`)
- Image optimization endpoint
- 404 fallback with Vista-styled page
- Dev error overlay on build/runtime errors

### Legacy Engine (`engine.ts`)

The traditional SSR engine (used with `--legacy` flag). ~927 lines.

Uses `webpack-hot-middleware` + `ReactRefreshWebpackPlugin` for HMR.
Renders React components to HTML server-side with `renderToPipeableStream`.

---

## 10. RSC Upstream (Flight Server)

**File**: `packages/vista/src/server/rsc-upstream.ts` (~673 lines)

This is a **separate Express server** that runs with `--conditions react-server` — a Node.js
flag that enables the `react-server` export condition, allowing `react-server-dom-webpack/server`
to work.

It is spawned as a **child process** by `rsc-engine.ts`.

**Why a separate process?**
React Server Components require the `react-server` condition for `react` and `react-dom` to
expose server-only APIs. This condition affects the entire Node.js process, so we can't mix
it with client-side React in the same process.

**What it does**:

1. Receives requests at `/rsc/{pathname}`
2. Matches the route against the server manifest
3. Loads the page component + layout chain
4. Renders to a Flight stream (`renderToPipeableStream` from `react-server-dom-webpack/server`)
5. Returns the binary Flight stream (`text/x-component`)

**Port**: `upstream = main + 1` (default: 3004)

**Spawn command** (simplified):

```bash
node --conditions react-server dist/server/rsc-upstream.js
```

---

## 11. Client Runtime

### RSC Router (`client/rsc-router.tsx`)

```
'use client' component — the client-side navigation engine for RSC mode.

┌─────────────┐
│  RSCRouter   │ ← Holds current Flight response as React state
│  (Provider)  │    Swaps on navigation via /rsc{pathname} fetch
├─────────────┤
│  RSCRoot     │ ← React.use(response) — suspends until Flight decodes
└─────────────┘
```

**Key behaviors**:

- `fetchFlight(pathname, search)` → fetches `/rsc{pathname}`, caches with LRU (max 50)
- Navigation uses `React.startTransition` → old UI stays visible while loading
- `push()`, `replace()`, `back()`, `forward()`, `prefetch()`, `refresh()`
- Exposed via `RSCRouterContext` (consumed by `useRouter()`, `<Link>`, etc.)

### Server Actions (`client/server-actions.ts`)

```typescript
// Posts to /rsc + current pathname with rsc-action header
export async function callServer(id: string, args: unknown[]): Promise<unknown> {
  const body = await encodeReply(args);
  const response = createFromFetch(
    fetch('/rsc' + pathname, {
      method: 'POST',
      headers: { 'rsc-action': id },
      body,
    })
  );
  return response;
}

// Re-exported from React 19:
export { useActionState } from 'react';
export { useFormStatus } from 'react-dom';
```

---

## 12. Metadata System

**File**: `packages/vista/src/metadata/generate.tsx` (521 lines)

Converts `Metadata` objects exported from page/layout components into HTML `<meta>` tags.

### Usage in App Code

```tsx
// app/root.tsx or any page.tsx
import type { Metadata } from 'vista';

export const metadata: Metadata = {
  title: 'My Page',
  description: 'Page description',
  openGraph: {
    title: 'OG Title',
    description: 'OG Description',
    images: ['/og.png'],
  },
};

// OR dynamic metadata:
export async function generateMetadata({ params }) {
  return {
    title: `Post: ${params.slug}`,
  };
}
```

### Metadata Types

```typescript
interface Metadata {
  title?: string | TemplateString;
  description?: string;
  metadataBase?: URL | string;
  openGraph?: OpenGraph;
  twitter?: Twitter;
  icons?: Icons;
  robots?: Robots;
  authors?: Author[];
  alternates?: AlternateURLs;
  verification?: Verification;
  appleWebApp?: AppleWebApp;
  // ...more
}

interface TemplateString {
  default: string;
  template?: string; // e.g., "%s | My Site"
  absolute?: string; // Ignores template
}
```

---

## 13. Font System

**File**: `packages/vista/src/font/google.ts` (354 lines)

Next.js-compatible Google Font loader.

### Usage

```tsx
import { Geist, Geist_Mono } from 'vista/font/google';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

// In your root layout:
<body className={`${geistSans.variable} ${geistMono.variable}`}>
```

### How It Works

1. `Geist({ variable, subsets, weight })` is called at import time
2. Builds a Google Fonts CSS2 API URL
3. Generates a unique class name via FNV-1a hash
4. Registers the font in the global font registry (`registerFont()`)
5. Returns `{ className, variable, style }` — `FontResult`
6. At render time, `getFontHeadHTML()` collects all registered fonts and emits
   `<link rel="preconnect" href="https://fonts.googleapis.com">` + CSS `<style>` blocks

### Registry

```
packages/vista/src/font/registry.ts
  → registerFont(entry: FontRegistryEntry)
  → getFontHeadHTML() → string (all <link> + <style> tags)
  → getCSSLinks() → string (for document shell injection)
```

---

## 14. Routing & File Conventions

Vista follows Next.js App Router conventions:

### File Conventions

| File            | Purpose                                     |
| --------------- | ------------------------------------------- |
| `root.tsx`      | Root layout (canonical, wraps `<html>`)     |
| `layout.tsx`    | Fallback root layout (with warning)         |
| `index.tsx`     | Page component (home = `app/index.tsx`)     |
| `page.tsx`      | Page component (alternative to `index.tsx`) |
| `loading.tsx`   | Loading UI (Suspense boundary)              |
| `error.tsx`     | Error boundary                              |
| `not-found.tsx` | Custom 404 page                             |
| `globals.css`   | Global CSS (processed by PostCSS)           |

### Route Segments

| Pattern        | Example              | Type                                  |
| -------------- | -------------------- | ------------------------------------- |
| `about/`       | `/about`             | Static segment                        |
| `[slug]/`      | `/post/hello`        | Dynamic segment                       |
| `[...slug]/`   | `/docs/a/b/c`        | Catch-all                             |
| `[[...slug]]/` | `/docs` or `/docs/a` | Optional catch-all                    |
| `(group)/`     | `(marketing)/about`  | Route group (no URL segment)          |
| `[not-found]/` | —                    | **RESERVED** (excluded from manifest) |

### Route Resolution

```
URL: /blog/hello-world

Scanner resolves:
  app/
    blog/
      [slug]/
        page.tsx        → matched!

Params: { slug: 'hello-world' }
```

### API Routes

```
app/api/{route}/route.ts

export async function GET(req, res) { ... }
export async function POST(req, res) { ... }
```

---

## 15. Structure Validator

**File**: `packages/vista/src/server/structure-validator.ts` (460 lines)

Validates the `app/` directory at build time and in dev mode (with file watching).

### Issue Codes

| Code                                | Severity | Meaning                                     |
| ----------------------------------- | -------- | ------------------------------------------- |
| `ROOT_MISSING`                      | error    | No `root.tsx` or `layout.tsx` found         |
| `ROOT_EXPORT_MISSING`               | error    | Root layout doesn't export default function |
| `LAYOUT_FALLBACK_USED`              | warning  | Using `layout.tsx` instead of `root.tsx`    |
| `RESERVED_NOT_FOUND_PUBLIC`         | error    | `[not-found]` used as public route          |
| `ROUTE_PATTERN_CONFLICT`            | error    | Conflicting route patterns                  |
| `INVALID_SEGMENT_NAME`              | warning  | Bad segment naming                          |
| `INVALID_NOT_FOUND_OVERRIDE_TARGET` | error    | notFoundRoute points to non-existent route  |
| `MULTIPLE_NOT_FOUND_SOURCES`        | warning  | Multiple 404 sources detected               |
| `METADATA_EXPORT_SHAPE_INVALID`     | warning  | Invalid metadata export shape               |
| `FILE_CONVENTION_VIOLATION`         | warning  | Wrong file naming convention                |

### Configuration

```typescript
// vista.config.ts
export default {
  validation: {
    structure: {
      enabled: true, // Enable/disable validation
      mode: 'strict', // 'strict' (errors fail build) or 'warn'
      logLevel: 'compact', // 'compact' or 'verbose'
      watchDebounceMs: 120, // Debounce for file watch re-validation
      includeWarningsInOverlay: false, // Show warnings in dev error overlay
    },
  },
};
```

---

## 16. Dev Error Overlay

**File**: `packages/vista/src/dev-error.tsx` (475 lines)

A standalone error overlay that works **without requiring React hydration** — uses
inline styles and vanilla JavaScript.

### Error Types

```typescript
interface VistaError {
  type: 'build' | 'runtime' | 'hydration';
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  codeFrame?: string;
}
```

### Features

- Dark theme with backdrop blur
- Color-coded badges (build = red, runtime = yellow, hydration = blue)
- Stack trace parsing with clickable file links
- Code frame display
- SSE auto-reconnect — overlay auto-dismisses when build succeeds
- `vistaOpenInEditor(file, line, column)` — opens file in your editor

---

## 17. SSE Live-Reload

Vista's RSC mode uses **Server-Sent Events** instead of webpack HMR.

### Why SSE instead of HMR?

React Server Components are rendered on a separate upstream process. When server components
change, the upstream process invalidates `require.cache` and serves fresh content. The client
needs a full page reload to get the new Flight stream — HMR partial updates don't work here.

### How It Works

```
rsc-engine.ts:
  1. fs.watch(app/, { recursive: true }) watches for .tsx/.ts/.jsx/.js changes
  2. On change → debounce 120ms → pushSSE('reload')
  3. Webpack compiler.hooks.done → pushSSE({ type: 'ok' }) or pushSSE({ type: 'error', message })

Client (auto-generated in rsc-client.tsx):
  1. new EventSource('/__vista_reload')
  2. onmessage:
     - 'reload' → window.location.reload()
     - { type: 'error' } → console.error
     - { type: 'ok' } → (no action, or dismiss error overlay)
  3. onerror → close + reconnect after 3s
```

### SSE Endpoint

```
GET /__vista_reload
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: connected

data: reload

data: {"type":"ok"}

data: {"type":"error","message":"Build failed: ..."}
```

---

## 18. Rust Crates

### `vista-transforms` (Pure Rust Library)

**Location**: `crates/vista-transforms/`

No Node.js dependency. Pure Rust library that can be used anywhere.

#### Modules

```
src/
├── lib.rs                    # Re-exports (client_directive + rsc + naming)
├── client_directive.rs       # 'use client' detection
├── naming.rs                 # ★ Framework naming constants + integrity token
└── rsc/
    ├── mod.rs                # RSC module entry
    ├── scanner.rs            # App directory scanner
    ├── manifest.rs           # Client/Server manifest generation
    ├── serializer.rs         # RSC payload serialization
    └── prerender.rs          # Client component prerendering
```

#### Key Functions

```rust
// client_directive.rs
pub fn has_client_directive(source: &str) -> bool;
pub fn detect_client_directive_fast(source: &str) -> ClientDirectiveResult;
pub fn analyze_file(source: &str) -> ClientDirectiveResult;

// rsc/scanner.rs
pub fn scan_app_directory(app_dir: &str) -> ScanResult;

// rsc/manifest.rs
pub fn generate_client_manifest(app_dir: &str, build_id: &str) -> ClientManifest;
pub fn generate_server_manifest(app_dir: &str, build_id: &str) -> ServerManifest;

// rsc/serializer.rs
pub fn serialize_value(value: &Value) -> Vec<u8>;
pub fn create_client_reference(id: &str, name: &str) -> ClientReference;
pub fn generate_hydration_script(payload: &RSCPayload) -> String;
pub fn encode_rsc_payload(payload: &RSCPayload) -> Vec<u8>;
pub fn decode_rsc_payload(bytes: &[u8]) -> Option<RSCPayload>;

// rsc/prerender.rs
pub fn prerender_client_component(file_path: &str) -> Option<PrerenderedComponent>;
pub fn prerender_all_client_components(app_dir: &str) -> HashMap<String, PrerenderedComponent>;
```

### `vista-napi` (Node.js Bindings)

**Location**: `crates/vista-napi/`

Thin NAPI wrapper calling `vista-transforms` functions. Compiled to a `.node` binary.

#### Exported NAPI Functions (callable from JavaScript)

```javascript
// Available when native binary is loaded
const native = require('vista-native.win32-x64-msvc.node');

native.isClientComponent(source); // → boolean
native.analyzeClientDirective(source); // → { isClient, directiveLine, exports }
native.getRouteTree(appDir); // → RouteNode tree
native.version(); // → string
native.hasMetadataExport(source); // → boolean
native.hasGenerateMetadata(source); // → boolean
native.analyzeMetadata(source); // → MetadataInfo
native.rscScanApp(appDir); // → ScanResult
native.rscGenerateClientManifest(appDir, buildId); // → ClientManifest
native.rscGenerateServerManifest(appDir, buildId); // → ServerManifest
native.rscGenerateMountId(); // → string
native.rscResetMountCounter(); // → void
native.rscPrerenderComponent(filePath); // → PrerenderedComponent | null
native.rscPrerenderAllComponents(appDir); // → Map<string, PrerenderedComponent>
```

---

## 19. NAPI Bindings

### How JS Loads Native Code

```
packages/vista/src/bin/file-scanner.ts
  │
  ├─ Try: require('vista-napi')
  ├─ Try: require('../../crates/vista-napi/index.js')
  ├─ Try: require from workspace root
  │
  └─ If all fail → Pure JS fallback (slower but works without Rust)
```

The fallback ensures Vista works even without compiling Rust. The native
bindings provide **10–100× faster** file scanning.

### Native Binary Naming

| Platform             | Binary Name                        |
| -------------------- | ---------------------------------- |
| Windows x64          | `vista-native.win32-x64-msvc.node` |
| Linux x64            | `vista-native.linux-x64-gnu.node`  |
| macOS x64            | `vista-native.darwin-x64.node`     |
| macOS ARM (M1/M2/M3) | `vista-native.darwin-arm64.node`   |

---

## 20. Constants & Naming System

Vista centralizes **all framework-specific naming** into constants files. This makes the framework
easier to maintain and is the foundation of the rename prevention system.

### Source of Truth

| Layer      | File                                    | Purpose                                |
| ---------- | --------------------------------------- | -------------------------------------- |
| TypeScript | `packages/vista/src/constants.ts`       | All TS/JS code imports from here       |
| Rust       | `crates/vista-transforms/src/naming.rs` | All Rust code uses these constants     |
| Tests      | `scripts/test-constants.cjs`            | Test scripts share constants from here |

### Constants Defined

| Constant                | Value                           | Usage                                      |
| ----------------------- | ------------------------------- | ------------------------------------------ |
| `FRAMEWORK_NAME`        | `'vista'`                       | Logs, error messages, branding             |
| `BUILD_DIR`             | `'.vista'`                      | Build output directory (≈ `.next/`)        |
| `URL_PREFIX`            | `'/_vista'`                     | Base URL for internal assets (≈ `/_next/`) |
| `STATIC_CHUNKS_PATH`    | `'/_vista/static/chunks/'`      | Webpack output public path                 |
| `IMAGE_ENDPOINT`        | `'/_vista/image'`               | Image optimization endpoint                |
| `SSE_ENDPOINT`          | `'/__vista_reload'`             | SSE live-reload endpoint                   |
| `STRUCTURE_ENDPOINT`    | `'/__vista_structure'`          | Structure validation SSE                   |
| `HYDRATE_DOCUMENT_FLAG` | `'__VISTA_HYDRATE_DOCUMENT__'`  | Window global for hydration mode           |
| `CLIENT_REFS_FLAG`      | `'__VISTA_CLIENT_REFERENCES__'` | Window global for client component refs    |
| `RSC_DATA_FLAG`         | `'__VISTA_RSC_DATA__'`          | Window global for RSC payload              |
| `BUILD_ID_DEFINE`       | `'__VISTA_BUILD_ID__'`          | Webpack DefinePlugin injection             |
| `MOUNT_ID_PREFIX`       | `'__vista_cc_'`                 | Client component DOM mount IDs             |

### Rules

1. **Never hardcode** `'.vista'`, `'/_vista/'`, `'__vista_'`, etc. in source files
2. **Always import** from `constants.ts` (TS) or use `naming::*` (Rust)
3. **Rust and TS constants must stay in sync** — verified by `test-integrity.cjs`
4. **Config files** (`.gitignore`, `flashrepo.json`, `eslint.config.mjs`) have comments linking to `BUILD_DIR`

### Renaming the Framework

If you need to rename the framework (e.g., from `vista` to something else):

1. Update `constants.ts` — all 12+ constants
2. Update `naming.rs` — mirror the same values
3. Recompile Rust: `cargo build --release`
4. Update `test-constants.cjs`
5. Update config files (`.gitignore`, `flashrepo.json`, `eslint.config.mjs`)
6. Update NAPI `index.js` — 40+ platform-specific `.node` filenames
7. Run `pnpm test:integrity` to verify sync

---

## 21. Rename Prevention & Integrity Guard

Vista includes a **4-layer rename prevention system** inspired by Next.js that makes it
difficult to fork the codebase and rebrand it via simple find-replace.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Rust Binary Identity                          │
│  naming.rs → compiled into .node binary                 │
│  getFrameworkIdentity() + verifyIntegrity()              │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Runtime Cross-Check                           │
│  integrity.ts → startup verifies TS ↔ Rust match        │
│  verifyFrameworkIntegrity(nativeModule)                  │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Build Watermark                               │
│  manifest.ts → __integrity token in every build         │
│  generateBuildWatermark()                               │
├─────────────────────────────────────────────────────────┤
│  Layer 4: CI Guard (48 automated checks)                │
│  test-integrity.cjs → runs on pnpm test                 │
│  TS sync, Rust sync, NAPI, no hardcoding, configs       │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: Rust Binary Identity

**Files**: `crates/vista-transforms/src/naming.rs`, `crates/vista-napi/src/lib.rs`

- `compute_integrity_token()` — hashes all naming constants at compile time
- `get_framework_identity()` — NAPI function returns name + token + all constants
- `verify_integrity(js_token)` — checks if JS-provided token matches Rust binary

Since these values are **baked into the compiled `.node` binary**, renaming JS constants
without recompiling Rust causes a token mismatch → crash.

### Layer 2: Runtime Cross-Check

**File**: `packages/vista/src/integrity.ts`

- `verifyFrameworkIntegrity(nativeModule)` — called at startup
- Compares each TS constant with its Rust counterpart
- Throws fatal error with specific mismatch details if tampered

### Layer 3: Build Watermark

**File**: `packages/vista/src/build/manifest.ts`

- Every `artifact-manifest.json` includes `__integrity: "vista:<hash>"`
- Build artifacts are traceable to the original framework

### Layer 4: CI Guard

**File**: `scripts/test-integrity.cjs` | **Command**: `pnpm test:integrity`

48 automated checks across 7 sections:

| Section                   | Checks                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| Layer 1: TS Constants     | `FRAMEWORK_NAME`, `BUILD_DIR`, `URL_PREFIX`, `SSE_ENDPOINT` exist           |
| Layer 2: Rust Sync        | `naming.rs` constants match TS values, `compute_integrity_token()` exists   |
| Layer 3: NAPI Bridge      | `getFrameworkIdentity`, `verifyIntegrity` exported, `vista-native.*` naming |
| Layer 4: No Hardcoding    | 8+ source files scanned for inline `/_vista`, `__vista_reload`, `.vista`    |
| Layer 5: Config Sync      | `.gitignore`, `flashrepo.json`, `eslint.config.mjs`, `package.json bin`         |
| Layer 6: Integrity Module | `integrity.ts` has all required functions                                   |
| Layer 7: Build Watermark  | `manifest.ts` imports watermark + embeds `__integrity`                      |

### What Happens If Someone Tries to Rename

| Attack                  | Result                                                        |
| ----------------------- | ------------------------------------------------------------- |
| Find-replace in JS only | Rust binary still returns `"vista"` → integrity check crashes |
| Also rename `naming.rs` | `.node` binary wasn't recompiled → same hash → crash          |
| Recompile Rust too      | Must rename 40+ `vista-native.*` entries in NAPI `index.js`   |
| Do ALL of above         | CI guard `test-integrity.cjs` catches inconsistencies         |
| Remove integrity check  | Build watermark in artifacts still says `"vista"`             |

---

## 22. Create-Vista-App Scaffolding CLI

**File**: `packages/create-vista-app/bin/cli.js` (210 lines)

```bash
# Create a new Vista project
npx create-vista-app@latest my-app

# Use local Vista package (for development)
npx create-vista-app@latest my-app --local
```

### What It Does

1. Detects package manager (npm/pnpm/yarn/bun) from `npm_config_user_agent`
2. Creates project directory
3. Copies `template/` → project directory
4. Writes `package.json` with:
   - `react@^19`, `react-dom@^19`, `react-server-dom-webpack@^19`
   - `postcss`, `@tailwindcss/postcss`, `tailwindcss@^4`
   - `@swc-node/register`, `tsx`, `swc-loader`
   - `css-loader`, `null-loader`, `mini-css-extract-plugin`
   - `webpack`, `webpack-dev-middleware`, `webpack-hot-middleware`
   - `@vistagenic/vista@latest` (or `file:../packages/vista` with `--local`)
5. Creates `.gitignore`
6. Runs `git init` + initial commit
7. Installs dependencies

### Template Structure

```
template/
├── app/
│   ├── root.tsx          # Root layout (<html>, <body>, fonts)
│   ├── index.tsx         # Home page
│   └── globals.css       # Tailwind v4 globals
├── public/               # Static assets
├── postcss.config.mjs    # PostCSS with @tailwindcss/postcss
├── tsconfig.json         # TypeScript config
├── vista-env.d.ts        # Vista type declarations
├── vista.config.ts       # Vista config
└── eslint.config.mjs     # ESLint config
```

---

## 23. Test Suite

### Test Scripts Overview

| Script                       | File                                     | Tests | Purpose                     |
| ---------------------------- | ---------------------------------------- | ----- | --------------------------- |
| `test:regression`            | `scripts/test-regression.cjs`            | 32    | Unit-level regression tests |
| `test:hardening`             | `scripts/test-vista-hardening.cjs`       | 8     | Cross-module integration    |
| `guard:create-vista-command` | `scripts/check-create-vista-command.cjs` | —     | CLI usage validation        |

### Regression Tests (32 tests across 5 suites)

```
Suite 1: Hidden Route Safety (6 tests)
  ✓ [not-found] excluded from server manifest
  ✓ [not-found] excluded from file scanner
  ✓ [not-found] excluded from route matching
  ✓ Valid routes still present after filtering
  ✓ notFoundRoute resolution works
  ✓ Reserved segments constant is defined

Suite 2: Metadata Parity (8 tests)
  ✓ Static metadata generates correct HTML
  ✓ Dynamic generateMetadata renders correctly
  ✓ OpenGraph tags generated
  ✓ Canonical URL generated
  ✓ Null metadata doesn't crash
  ✓ Empty metadata returns empty string
  ✓ Template string title works
  ✓ Multiple authors handled

Suite 3: SSR vs RSC Parity (10 tests)
  ✓ Same 404 status codes
  ✓ Same metadata merge order
  ✓ Both engines reference resolveNotFoundComponent
  ✓ Nested routes resolve correctly
  ✓ Dynamic routes resolve correctly
  ... and more

Suite 4: Structure Validator Regression (4 tests)
  ✓ ROOT_MISSING issue code exists
  ✓ RESERVED_NOT_FOUND_PUBLIC issue code exists
  ✓ Route graph generation works
  ✓ Validation result has correct shape

Suite 5: Type Export Consistency (4 tests)
  ✓ Metadata type is exported
  ✓ VistaConfig type is exported
  ✓ Router types are exported
  ✓ Font types are exported
```

### Running Tests

```bash
# Bash — run all tests
pnpm test

# Bash — run individual suites
node scripts/test-regression.cjs
node scripts/test-vista-hardening.cjs
node scripts/check-create-vista-command.cjs

# PowerShell — run all tests
pnpm test

# PowerShell — run individual suites
node scripts\test-regression.cjs
node scripts\test-vista-hardening.cjs
node scripts\check-create-vista-command.cjs
```

---

## 24. All Commands Reference

### Development Commands

```bash
# ─── Framework Development ───

# Build the framework (compile TypeScript)
cd packages/vista && npx tsc               # Bash
Set-Location packages\vista; npx tsc       # PowerShell

# Build Rust native bindings
cargo build --release                       # Both

# ─── Test App Development ───

# Start test app dev server (RSC mode)
cd test-app && npx vista dev               # Bash
Set-Location test-app; npx vista dev       # PowerShell

# Start test app dev server (Legacy SSR mode)
cd test-app && npx vista dev --legacy      # Bash
Set-Location test-app; npx vista dev --legacy  # PowerShell

# Production build
cd test-app && npx vista build             # Bash
Set-Location test-app; npx vista build     # PowerShell

# Start production server
cd test-app && npx vista start             # Bash
Set-Location test-app; npx vista start     # PowerShell

# ─── Monorepo Commands ───

pnpm install                               # Install all dependencies
pnpm build                                 # Build all packages (flash runner)
pnpm dev                                   # Dev mode all packages (flash runner)
pnpm lint                                  # Lint everything
pnpm lint:fix                              # Auto-fix lint errors
pnpm format                                # Format with Prettier
pnpm format:check                          # Check formatting
pnpm test                                  # Run full test suite
pnpm clean                                 # Clean all build artifacts
```

### Process Management (Windows PowerShell)

```powershell
# Kill all node processes (when dev server won't stop)
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force

# Kill specific port
Get-NetTCPConnection -LocalPort 3003 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Check what's running on port 3003
Get-NetTCPConnection -LocalPort 3003 -ErrorAction SilentlyContinue

# Wait then kill
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 2
```

### Process Management (Bash / Linux / macOS)

```bash
# Kill all node processes
pkill -f node

# Kill specific port
lsof -ti :3003 | xargs kill -9

# Check what's running on port 3003
lsof -i :3003
```

### Rust Commands

```bash
# Build debug
cargo build

# Build release (optimized, LTO)
cargo build --release

# Run tests
cargo test

# Check without building
cargo check

# Format Rust code
cargo fmt

# Lint with Clippy
cargo clippy

# Build only vista-napi
cargo build --release -p vista-napi

# Build only vista-transforms
cargo build --release -p vista-transforms
```

### Git Commands Used in This Project

```bash
# Standard workflow
git add -A
git commit -m "feat: description"
git push origin main

# Check status
git status
git log --oneline -10
```

---

## 25. Key Files Quick Reference

### Files You'll Touch Most Often

| File                                               | Purpose                  | When to Edit                                       |
| -------------------------------------------------- | ------------------------ | -------------------------------------------------- |
| `packages/vista/src/server/rsc-engine.ts`          | RSC dev/prod server      | Server behavior, routes, middleware, SSE, shutdown |
| `packages/vista/src/server/rsc-upstream.ts`        | Flight server (upstream) | Server component rendering, Flight stream          |
| `packages/vista/src/build/rsc/compiler.ts`         | Webpack configs          | Build pipeline, loaders, plugins                   |
| `packages/vista/src/bin/build-rsc.ts`              | RSC build orchestrator   | Build steps, entry generation, PostCSS             |
| `packages/vista/src/client/rsc-router.tsx`         | Client-side navigation   | Router behavior, caching, transitions              |
| `packages/vista/src/server/root-resolver.ts`       | Root layout resolution   | Layout detection, not-found resolution             |
| `packages/vista/src/metadata/generate.tsx`         | Metadata → HTML          | SEO tags, OpenGraph, Twitter cards                 |
| `packages/vista/src/font/google.ts`                | Google Fonts             | Font loading, CSS injection                        |
| `packages/vista/src/server/structure-validator.ts` | App structure validation | New validation rules, issue codes                  |
| `packages/vista/src/dev-error.tsx`                 | Error overlay            | Error display, styling, SSE reconnect              |
| `packages/vista/src/config.ts`                     | Config system            | New config options                                 |
| `packages/vista/src/bin/file-scanner.ts`           | File scanner             | Route discovery, component categorization          |
| `packages/vista/src/server/not-found-page.ts`      | 404 fallback page        | 404 styling                                        |
| `packages/vista/bin/vista.js`                      | CLI entry                | New commands, flags                                |
| `crates/vista-napi/src/lib.rs`                     | NAPI bindings            | New native functions                               |
| `crates/vista-transforms/src/`                     | Rust transforms          | Performance-critical scanning/parsing              |

### Files You Rarely Touch

| File                                             | Purpose                     |
| ------------------------------------------------ | --------------------------- |
| `packages/vista/src/server/engine.ts`            | Legacy SSR engine (stable)  |
| `packages/vista/src/server/static-cache.ts`      | Static file cache (stable)  |
| `packages/vista/src/server/middleware-runner.ts` | Middleware chain (stable)   |
| `packages/vista/src/server/image-optimizer.ts`   | Image optimization (stable) |
| `packages/vista/src/client/link.tsx`             | `<Link>` component (stable) |
| `packages/vista/src/client/navigation.ts`        | useRouter hooks (stable)    |

---

## 26. Architecture Diagrams

### RSC Request Flow

```
┌──────────┐     GET /          ┌──────────────────┐    GET /rsc/     ┌──────────────────┐
│          │ ──────────────────→ │                  │ ───────────────→ │                  │
│  Browser │                    │  RSC Engine       │                  │  RSC Upstream     │
│          │ ←───── HTML ────── │  (port 3003)      │ ← Flight stream │  (port 3004)      │
│          │                    │  Express +        │                  │  Express +        │
│          │     GET /rsc/*     │  webpack-dev-mw   │                  │  react-server     │
│          │ ──────────────────→│                   │ ───────────────→ │  condition        │
│          │ ← Flight stream ── │                   │ ← Flight stream │                  │
└──────────┘                    └──────────────────┘                  └──────────────────┘
                                       │
                                       │ fs.watch(app/)
                                       │ SSE push 'reload'
                                       ↓
                                ┌──────────────────┐
                                │  /__vista_reload  │
                                │  (SSE endpoint)   │
                                └──────────────────┘
```

### Build Pipeline

```
vista dev / vista build
       │
       ├─ validateAppStructure()
       ├─ scanAppDirectory()          ← Rust NAPI (fast) or JS fallback
       ├─ runPostCSS()                ← globals.css → .vista/client.css
       ├─ generateRSCClientEntry()    ← Auto-generates .vista/rsc-client.tsx
       │
       ├─ Server Webpack ──→ .vista/server/app/*.js (node, commonjs2)
       │      └─ All components (server + client)
       │
       └─ Client Webpack ──→ .vista/static/chunks/*.js (web, esm)
              ├─ ReactFlightWebpackPlugin → manifests
              ├─ SplitChunks → webpack.js, framework.js, vendor.js
              ├─ VistaSSRManifestPatch → {specifier,name} → {id,chunks,name}
              └─ MiniCssExtractPlugin → modules.css
```

### Module Dependency Graph

```
bin/vista.js
  ├─ dist/bin/build-rsc.js ──→ dist/build/rsc/compiler.js
  │                              ├─ createServerWebpackConfig()
  │                              └─ createClientWebpackConfig()
  │                                   └─ ReactFlightWebpackPlugin
  │
  ├─ dist/server/rsc-engine.js
  │    ├─ spawnUpstream() ──→ dist/server/rsc-upstream.js
  │    ├─ renderFlightToHTMLStream()
  │    │    ├─ react-server-dom-webpack/client.node (createFromNodeStream)
  │    │    └─ react-dom/server (renderToPipeableStream)
  │    ├─ findChunkFiles()
  │    ├─ createHtmlDocument()
  │    ├─ SSE live-reload
  │    └─ webpack-dev-middleware
  │
  └─ dist/server/engine.js (legacy)
       ├─ webpack-dev-middleware
       ├─ webpack-hot-middleware
       └─ ReactRefreshWebpackPlugin
```

---

## 27. Common Development Workflows

### Workflow 1: Change Server Behavior

```bash
# 1. Edit the file
#    packages/vista/src/server/rsc-engine.ts

# 2. Rebuild
cd packages/vista && npx tsc

# 3. Kill running dev server
# PowerShell:
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 2
# Bash:
pkill -f node; sleep 2

# 4. Restart
cd test-app && npx vista dev
```

### Workflow 2: Change Client Runtime

```bash
# 1. Edit the file
#    packages/vista/src/client/rsc-router.tsx

# 2. Rebuild
cd packages/vista && npx tsc

# 3. Restart dev server (client code needs full rebuild)
# Kill → restart as above
```

### Workflow 3: Change Webpack Config

```bash
# 1. Edit
#    packages/vista/src/build/rsc/compiler.ts

# 2. Rebuild
cd packages/vista && npx tsc

# 3. IMPORTANT: Delete .vista/ in test-app to force fresh build
# PowerShell:
Remove-Item -Recurse -Force test-app\.vista -ErrorAction SilentlyContinue
# Bash:
rm -rf test-app/.vista

# 4. Restart dev server
```

### Workflow 4: Change Rust NAPI Bindings

```bash
# 1. Edit crates/vista-napi/src/lib.rs or crates/vista-transforms/src/**

# 2. Build release
cargo build --release

# 3. Copy the binary to the NAPI package directory
# Windows:
copy target\release\vista_napi.dll crates\vista-napi\vista-native.win32-x64-msvc.node
# Linux:
cp target/release/libvista_napi.so crates/vista-napi/vista-native.linux-x64-gnu.node
# macOS:
cp target/release/libvista_napi.dylib crates/vista-napi/vista-native.darwin-arm64.node

# 4. Restart dev server
```

### Workflow 5: Add a New Export to the Package

```bash
# 1. Create the source file in packages/vista/src/
# 2. Add to packages/vista/src/index.ts (if it's a type/utility)
# 3. Add to "exports" in packages/vista/package.json
# 4. Rebuild: cd packages/vista && npx tsc
# 5. Test in test-app: import { NewThing } from 'vista/new-path';
```

### Workflow 6: Run Full Test Suite Before Push

```bash
# Bash
cd packages/vista && npx tsc && cd ../.. && pnpm test

# PowerShell
Set-Location packages\vista; npx tsc; Set-Location ..\...; pnpm test
```

---

## 28. Bug Bounty & Debugging Guide

### Where Bugs Typically Live

| Symptom                                         | Likely File                                       | What to Check                                                                 |
| ----------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Page shows error overlay instead of content     | `rsc-engine.ts`                                   | Check `renderFlightToHTMLStream` catch block                                  |
| 404 shows error overlay instead of 404 page     | `rsc-engine.ts`                                   | Check `upstream.status !== 404` guard                                         |
| Infinite page reload loop                       | `rsc-engine.ts` SSE + `build-rsc.ts` client entry | Check SSE message filter, EventSource reconnect logic                         |
| Hydration mismatch                              | Browser extensions OR `rsc-engine.ts` shell       | Add `suppressHydrationWarning` to `<html>` and `<body>`                       |
| `Cannot set properties of undefined` in console | Stale `.hot-update.js` files                      | Check `cleanHotUpdateFiles()` or delete `.vista/static/chunks/*.hot-update.*` |
| webpack `No serializer registered` warning      | `compiler.ts`                                     | Ensure `cache: false` for RSC client build                                    |
| Flight stream decode error                      | `rsc-upstream.ts`                                 | Check Flight manifest paths, verify `--conditions react-server`               |
| CSS not loading                                 | `rsc-engine.ts` CSS routes                        | Check PostCSS ran, `.vista/client.css` exists                                 |
| Font not loading                                | `font/google.ts` + `font/registry.ts`             | Check `registerFont()` called, `getFontHeadHTML()` in shell                   |
| Metadata not in HTML                            | `rsc-engine.ts` createHtmlDocument                | Check `generateMetadataHtml()` called with correct metadata                   |
| Server won't stop on Ctrl+C                     | `rsc-engine.ts` shutdown handler                  | Check all resources closed (upstream, watcher, SSE, server)                   |
| `Module not found: 'vista/client/rsc-router'`   | `compiler.ts` resolve.alias                       | Check alias path resolution                                                   |

### Debugging Steps

#### 1. Enable Debug Logging

```bash
# Set DEBUG_VISTA=1 for verbose build output
# Bash:
DEBUG_VISTA=1 npx vista dev

# PowerShell:
$env:DEBUG_VISTA = "1"; npx vista dev
```

#### 2. Check Build Artifacts

```bash
# List generated files
# Bash:
ls -la test-app/.vista/
ls -la test-app/.vista/static/chunks/
cat test-app/.vista/rsc-client.tsx

# PowerShell:
Get-ChildItem test-app\.vista\
Get-ChildItem test-app\.vista\static\chunks\
Get-Content test-app\.vista\rsc-client.tsx
```

#### 3. Check Flight Manifests

```bash
# Bash:
cat test-app/.vista/react-client-manifest.json | python -m json.tool
cat test-app/.vista/react-server-manifest.json | python -m json.tool
cat test-app/.vista/server/server-manifest.json | python -m json.tool

# PowerShell:
Get-Content test-app\.vista\react-client-manifest.json | ConvertFrom-Json | ConvertTo-Json -Depth 10
Get-Content test-app\.vista\react-server-manifest.json | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

#### 4. Test Flight Stream Directly

```bash
# Bash:
curl -H "Accept: text/x-component" http://localhost:3004/rsc/
curl -H "Accept: text/x-component" http://localhost:3004/rsc/about

# PowerShell:
Invoke-WebRequest -Uri "http://localhost:3004/rsc/" -Headers @{ Accept = "text/x-component" }
Invoke-WebRequest -Uri "http://localhost:3004/rsc/about" -Headers @{ Accept = "text/x-component" }
```

#### 5. Check SSE Connection

```bash
# Bash:
curl -N http://localhost:3003/__vista_reload

# PowerShell (will stream):
Invoke-WebRequest -Uri "http://localhost:3003/__vista_reload"
```

### How to Report a Bug

1. **Reproduce**: Minimal steps to trigger
2. **Console output**: Both browser console AND terminal output
3. **Screenshot**: If visual bug
4. **File changed**: What you edited before the bug appeared
5. **Environment**: OS, Node version, browser

### How to Fix a Bug

1. Identify the file from the symptom table above
2. Read the relevant section of this document to understand the flow
3. Add `console.log` / `console.error` with `[vista:debug]` prefix
4. Fix the issue
5. Rebuild: `cd packages/vista && npx tsc`
6. Kill all node processes, restart dev server
7. Run regression tests: `node scripts/test-regression.cjs`
8. Commit with descriptive message

---

## 29. Rust Setup & Native Build

### First-Time Rust Setup

```bash
# Install Rust (all platforms)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Or on Windows, download from:
# https://rustup.rs

# Verify installation
rustc --version
cargo --version
```

### rust-toolchain.toml

```toml
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
targets = [
  "x86_64-pc-windows-msvc",
  "x86_64-unknown-linux-gnu",
  "aarch64-apple-darwin"
]
```

### Building NAPI Bindings

```bash
# From repo root
cargo build --release
```

This builds:

- `target/release/vista_napi.dll` (Windows)
- `target/release/libvista_napi.so` (Linux)
- `target/release/libvista_napi.dylib` (macOS)

### Cargo.toml (Workspace)

```toml
[workspace]
resolver = "2"
members = [
    "crates/vista-transforms",
    "crates/vista-napi",
]

[profile.release]
lto = true           # Link-Time Optimization
codegen-units = 1    # Single codegen unit (slower build, faster binary)
opt-level = 3        # Maximum optimization
```

### Adding a New Rust Function

1. Add function to `crates/vista-transforms/src/` (pure Rust)
2. Add NAPI wrapper in `crates/vista-napi/src/lib.rs`:
   ```rust
   #[napi]
   pub fn my_new_function(input: String) -> napi::Result<String> {
     Ok(vista_transforms::my_new_function(&input))
   }
   ```
3. Add TypeScript declaration in `crates/vista-napi/index.d.ts`
4. Use from JS:
   ```typescript
   const native = require('vista-napi');
   const result = native.myNewFunction(input);
   ```
5. Build: `cargo build --release`
6. Copy `.node` file to `crates/vista-napi/`

### Cross-Compilation

For GitHub Actions CI/CD to build for all platforms:

```bash
# Install target
rustup target add aarch64-apple-darwin

# Cross-compile
cargo build --release --target aarch64-apple-darwin
```

---

## 30. Known Issues & Gotchas

### 1. Browser Extensions Cause Hydration Warnings

**Problem**: Extensions like ColorZilla, Grammarly, etc. inject attributes on `<body>`
before React hydrates, causing "A tree hydrated but some attributes didn't match" warnings.

**Fix**: Add `suppressHydrationWarning` to `<html>` and `<body>` in root layout:

```tsx
<html lang="en" suppressHydrationWarning>
  <body suppressHydrationWarning>
```

### 2. No HMR in RSC Mode

**By Design**: RSC mode uses SSE live-reload (full page refresh) instead of webpack HMR.
This is because server components run in a separate process and HMR partial updates
don't apply to Flight stream changes.

### 3. Stale Hot-Update Files

**Problem**: If you previously ran with HMR enabled, `.hot-update.js` files may remain
in `.vista/static/chunks/` and get loaded as `<script>` tags, causing crashes.

**Fix**: `cleanHotUpdateFiles()` runs on server startup. If issues persist:

```bash
# Bash:
rm -f test-app/.vista/static/chunks/*.hot-update.*

# PowerShell:
Remove-Item test-app\.vista\static\chunks\*hot-update* -ErrorAction SilentlyContinue
```

### 4. Port Already In Use

**Problem**: Previous dev server didn't shut down cleanly.

**Fix**:

```bash
# Bash:
lsof -ti :3003 | xargs kill -9
lsof -ti :3004 | xargs kill -9

# PowerShell:
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
```

### 5. `react-server` Condition

**Problem**: The upstream Flight server MUST run with `--conditions react-server` flag.
Without it, React won't expose server-only APIs.

**How it's handled**: `spawnUpstream()` in `rsc-engine.ts` automatically passes
`--conditions react-server` when spawning the child process.

### 6. Flight Manifest `{specifier, name}` vs `{id, chunks, name}`

**Problem**: `ReactFlightWebpackPlugin` generates `{specifier, name}` in the SSR manifest,
but `react-server-dom-webpack/client.node` expects `{id, chunks, name}`.

**Fix**: `VistaSSRManifestPatch` plugin in `compiler.ts` post-processes the manifest to
transform the format.

### 7. `cache: false` for RSC Client Build

**Problem**: `ReactFlightWebpackPlugin` creates `AsyncDependenciesBlock` which has no
webpack serializer, causing noisy warnings when filesystem cache is enabled.

**Fix**: Client RSC webpack config has `cache: false`.

### 8. CSS Not Updating

**Problem**: PostCSS output is generated at build time, not watched.

**Workaround**: Restart dev server after CSS changes. The SSE reload will trigger on
`.tsx`/`.ts` file changes but not `.css` changes directly.

### 9. Windows Path Issues

**Problem**: Webpack manifests use forward slashes, but Windows uses backslashes.

**How it's handled**: Path normalization throughout the codebase using:

```typescript
const normalized = filePath.replace(/\\/g, '/');
```

---

## 31. Deployment

### Production Build

```bash
# Build everything
cd test-app
npx vista build

# Output:
# .vista/static/chunks/  → Client bundles (serve with CDN)
# .vista/server/          → Server bundles
# .vista/client.css       → Compiled CSS
```

### Production Start

```bash
NODE_ENV=production npx vista start
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN npx vista build
EXPOSE 3003
CMD ["npx", "vista", "start"]
```

### Vercel

```json
// vercel.json
{
  "buildCommand": "npx vista build",
  "outputDirectory": ".vista",
  "framework": null
}
```

### Render

```yaml
# render.yaml
services:
  - type: web
    name: vista-app
    buildCommand: npx vista build
    startCommand: npx vista start
    envVars:
      - key: NODE_ENV
        value: production
```

---

## 32. Contributing Checklist

Before submitting a PR:

- [ ] `cd packages/vista && npx tsc` — no TypeScript errors
- [ ] `pnpm lint` — no lint errors
- [ ] `node scripts/test-regression.cjs` — all 32 tests pass
- [ ] `node scripts/test-vista-hardening.cjs` — all hardening tests pass
- [ ] `node scripts/check-create-vista-command.cjs` — CLI guard passes
- [ ] If you changed Rust code: `cargo build --release && cargo test && cargo clippy`
- [ ] If you changed webpack config: delete `.vista/` and test fresh build
- [ ] If you changed the server: test both `vista dev` and `vista start`
- [ ] If you changed routes/scanning: test with nested routes, dynamic routes, 404
- [ ] Commit message follows: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

---

## Appendix: Environment Variables

| Variable            | Default | Purpose                       |
| ------------------- | ------- | ----------------------------- |
| `PORT`              | `3003`  | Main server port              |
| `RSC_UPSTREAM_PORT` | `3004`  | Flight upstream server port   |
| `NODE_ENV`          | —       | `production` for prod builds  |
| `VISTA_LEGACY`      | —       | `true` to use Legacy SSR mode |
| `DEBUG_VISTA`       | —       | `1` for verbose build logging |

---

## Appendix: TypeScript Configuration

```jsonc
// packages/vista/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "jsx": "react-jsx",
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"],
}
```

---

_This document was generated for the Vista JS development team. Keep it updated
as the codebase evolves. When in doubt, read the source — the code is the truth._

---

## 33. Typed API (Experimental, Package-First)

### Purpose

Typed API is experimental and **off by default**. It adds:

- Server DSL from `@vistagenic/vista/stack`
- Typed client from `@vistagenic/vista/stack/client`
- Optional CLI scaffolding via `vista g ...`

### Public Package APIs

```ts
import { vstack } from '@vistagenic/vista/stack';
import { createVistaClient } from '@vistagenic/vista/stack/client';
```

Server:

- `vstack.init()`
- `v.procedure`, `v.middleware`, `v.router`, `v.mergeRouters`

Client:

- `createVistaClient<AppRouter>()`
- `$get`, `$post`, `$url`

### Config

```ts
const config = {
  experimental: {
    typedApi: {
      enabled: true,
      serialization: 'json', // 'json' | 'superjson'
      bodySizeLimitBytes: 1024 * 1024,
    },
  },
};
```

### Runtime Bridge Behavior

Both engines (`engine.ts`, `rsc-engine.ts`) follow:

1. Check legacy `app/api/*` route first
2. If no legacy file, fallback to typed API router
3. Typed API runs only when `experimental.typedApi.enabled === true`

This preserves backward compatibility for existing API routes.

### CLI Convenience (Optional)

Generators:

```bash
vista g api-init
vista g router users
vista g procedure create-user post
```

New app starter:

```bash
npx create-vista-app@latest my-app --typed-api
```

### Migration Path

1. Enable typed API flag in `vista.config.ts`
2. Scaffold starter files with `vista g api-init`
3. Move one legacy route at a time into typed router/procedure files
4. Keep legacy routes as fallback during migration

### Rollback Path

Immediate rollback:

```ts
experimental: { typedApi: { enabled: false } }
```

With rollback off, typed routes stop serving requests and legacy `app/api/*` behavior remains unchanged.


