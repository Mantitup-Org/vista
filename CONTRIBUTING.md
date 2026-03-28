# Contributing to Vista.js

Thanks for helping improve Vista. This repo moves quickly, so the most helpful contributions are the ones that stay aligned with the current package/runtime shape instead of older assumptions.

## Ground Rules

- Never push directly to `main`.
- Start work from `development` unless a maintainer asks for a different base.
- Keep each branch focused on one fix or feature.
- If you change published package source, rebuild the committed package output before opening a PR.

## Prerequisites

- Node.js 20+
- pnpm 8.15+
- npm (used for package publish flow)
- Rust stable toolchain

## Clone and Setup

```bash
git clone https://github.com/vistakit/Vista-Js.git vista-source
cd vista-source
pnpm install
```

Optional but recommended when you touch native code:

```bash
npm --prefix crates/vista-napi run build
```

Build the framework package after editing `packages/vista/src`:

```bash
npm --prefix packages/vista run build
```

## Branch Workflow

```bash
git checkout development
git pull origin development
git checkout -b feat/my-change
```

Use `fix/...`, `feat/...`, `docs/...`, or similar branch names.

## What to Run Before a PR

Choose the narrowest relevant checks, then run the bigger suite before asking for review.

### If you change framework runtime, RSC, routing, cache, or manifests

```bash
npm --prefix packages/vista run build
pnpm test:server-runtime
pnpm test:rsc-conformance
pnpm test:vista-output
```

### If you change Flashpack behavior

```bash
npm --prefix packages/vista run build
pnpm test:flashpack-dev
pnpm test:flashpack-state
```

### If you change integrity, naming, or Rust bridge behavior

```bash
pnpm test:integrity
pnpm test:rust-bridge
```

### If you change scaffolding or starter templates

```bash
pnpm test:create-vista-app
```

### If you change docs site behavior (`apps/web`)

```bash
npm --prefix apps/web run build
```

### Before a larger PR or release-oriented change

```bash
pnpm test
```

## Dist and Generated Output Rules

These repo rules matter:

- `packages/vista/dist` is committed. If you change `packages/vista/src`, rebuild and include the matching `dist` updates.
- If you change package exports or native bridge behavior, verify the published package shape still works.
- Do not commit random temp folders or local smoke apps.

## Repo Areas

- `packages/vista/`: framework package, CLI, runtime, build system, theme exports, cache APIs
- `packages/create-vista-app/`: scaffolding CLI and starter templates
- `apps/web/`: official site and docs at `vista.xyz`
- `crates/`: top-level Rust crates (`vista-core`, `vista-api`, `vista-napi`, etc.)
- `flashpack/`: Rust-backed Flashpack engine crates
- `bench/`: Vista-first benchmark fixtures
- `scripts/`: guards, regression suites, conformance, and release-adjacent checks

## PR Checklist

Before opening a PR, make sure:

- the branch is based on `development`
- changed docs mention the correct repo URL: `https://github.com/vistakit/Vista-Js.git`
- package versions are not bumped unless this is a release task
- committed `dist` output matches changed source where required
- relevant tests/builds have been run
- the PR explains what changed and why

## Maintainer Release Notes

Maintainers publish from `development` using Lerna:

```bash
git add -A
git commit -m "release: x.y.z"
git push origin development
npx lerna publish from-package --yes
git tag vx.y.z
git push origin vx.y.z
```

If `lerna publish` dirties `packages/*/package.json` because a publish attempt wrote `gitHead`, restore those files before retrying.

## Need Help?

- Open an issue for bugs or feature requests
- Start a draft PR early if you want feedback on direction
- When in doubt, prefer smaller, reviewable changes over giant refactors
