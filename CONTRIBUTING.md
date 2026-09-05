# Contributing to Vista.js

Thanks for helping improve Vista.js. This repository moves quickly, so the most helpful contributions are the ones that stay aligned with the current package and runtime architecture.

## Contribution Priorities

The repository contains several high-priority issues and feature requests. Contributors are encouraged to start with the listed issues before exploring additional improvements.

However, you are **not limited to the existing issue list**.

You are welcome to:

- Fix bugs you discover.
- Create and resolve your own issues.
- Implement new features.
- Improve existing functionality.
- Improve performance.
- Improve documentation.
- Add AI or agentic capabilities.
- Improve developer experience.
- Identify and solve architectural or runtime problems.
- Propose and implement improvements that are not currently listed.

Listed issues will generally receive **higher priority during contribution evaluation**.

## Ground Rules

- Never push directly to `main`.
- Fork the repository before making changes.
- Create a separate branch for your contribution.
- Keep each branch focused on one fix, feature, or contribution.
- Do not submit unrelated changes in the same Pull Request unless they are required for the contribution.
- If you change published package source, rebuild the committed package output before opening a Pull Request.

## Prerequisites

- Node.js 20+
- pnpm 8.15+
- npm
- Rust stable toolchain

## Fork and Clone

Fork the repository from GitHub:

```text
https://github.com/vistakit/Vista-Js
```

Then clone your fork:

```bash
git clone https://github.com/<your-username>/Vista-Js.git
cd Vista-Js
pnpm install
```

Optional but recommended when working with native code:

```bash
npm --prefix crates/vista-napi run build
```

Build the framework package after editing `packages/vista/src`:

```bash
npm --prefix packages/vista run build
```

## Branch Workflow

All contributions must be made through a separate branch.

First, make sure you are on the latest `main` branch:

```bash
git checkout main
git pull origin main
```

Create a new branch using the following format:

```text
branch-name-username
```

For example:

```text
fix-rsc-conformance-ankan
feature-ai-agent-ankan
deployment-vercel-ankan
middleware-support-ankan
docs-contributing-ankan
```

Create the branch with:

```bash
git checkout -b branch-name-username
```

For example:

```bash
git checkout -b fix-rsc-conformance-ankan
```

Use a short and descriptive branch name that clearly represents your contribution.

## Contribution Workflow

Follow these steps when making a contribution:

1. Fork the Vista.js repository.
2. Clone your fork locally.
3. Make sure your local repository is up to date with `main`.
4. Create a new branch using the `branch-name-username` format.
5. Identify an existing issue or create your own issue if you have found a new problem or improvement.
6. Implement your fix, feature, or improvement.
7. Run the relevant tests and builds.
8. Update the README or relevant documentation when required.
9. Provide clear and verifiable proof of completion.
10. Push your branch to your fork.
11. Open a Pull Request against the `main` branch.
12. Clearly explain what changed, why it was needed, and how it was tested.
13. Respond to review feedback and make any requested changes.

## Contribution Proof

Every contribution must include clear and verifiable proof of completion in the Pull Request.

The proof should demonstrate that the submitted fix, feature, or improvement actually works.

Depending on the type of contribution, acceptable proof may include:

- A demo video showing the implemented feature or fix.
- A deployed link demonstrating the change.
- Screenshots or screen recordings showing the result.
- Relevant test output.
- Benchmark results, where applicable.
- Reproduction steps demonstrating that a bug has been fixed.
- Before-and-after comparisons.
- Logs or console output where relevant.
- Any other clear and verifiable evidence demonstrating successful completion.

For larger features, a **demo video or deployed example is strongly recommended**.

The proof should clearly demonstrate the contribution and, where applicable, reference the issue being addressed.

Maintainers may request additional proof, reproduction steps, tests, or other evidence during the review process.

## README and Documentation

If your contribution introduces a new feature, changes existing behavior, adds a new workflow, or affects how developers use Vista.js, update the relevant documentation.

This may include:

- `README.md`
- Documentation under `apps/web`
- API documentation
- Examples
- Configuration documentation
- Deployment documentation

Documentation should reflect the current implementation and should not describe unsupported or speculative behavior.

## What to Run Before a PR

Choose the narrowest relevant checks first, then run the larger suite before requesting review.

### If you change framework runtime, RSC, routing, cache, or manifests

```bash
npm --prefix packages/vista run build
pnpm test:server-runtime
pnpm test:inline-server-actions
pnpm test:rsc-conformance
pnpm test:vista-output
```

If you touch the module compile hook (`packages/vista/src/server/module-compile-hook.ts`)
or anything that rewrites source at require time, run `pnpm test:inline-server-actions`
first: it is the fast guard for inline `'use server'` / `'use cache'` directives, and it
fails with a pointed message instead of surfacing as an HTTP 500 in the conformance suite.
See section 13.4 of `developer.md` for the background.

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

These repository rules matter:

- `packages/vista/dist` is committed. If you change `packages/vista/src`, rebuild and include the matching `dist` updates.
- If you change package exports or native bridge behavior, verify that the published package shape still works.
- Do not commit random temporary folders or local smoke applications.
- Do not commit generated files unless they are expected to be part of the repository.

## Repo Areas

- `packages/vista/`: framework package, CLI, runtime, build system, theme exports, cache APIs
- `packages/create-vista-app/`: scaffolding CLI and starter templates
- `apps/web/`: official site and documentation at `vista.xyz`
- `crates/`: top-level Rust crates (`vista-core`, `vista-api`, `vista-napi`, etc.)
- `flashpack/`: Rust-backed Flashpack engine crates
- `bench/`: Vista-first benchmark fixtures
- `scripts/`: guards, regression suites, conformance, and release-adjacent checks

## Issue Guidelines

Before creating an issue, search the existing issues to make sure the problem or feature has not already been reported.

When creating an issue:

- Use a clear and descriptive title.
- Explain the problem or proposed feature.
- Include reproduction steps for bugs.
- Include relevant logs or error output.
- Explain the expected behavior.
- Explain the actual behavior.
- Include screenshots, recordings, or other supporting information when useful.
- For feature requests, explain the intended use case and expected outcome.

If you discover an important issue that is not currently listed, you are encouraged to create it and contribute a solution.

## Pull Request Guidelines

A Pull Request should:

- Have a clear and descriptive title.
- Target the `main` branch.
- Reference the relevant issue when applicable.
- Explain what was changed.
- Explain why the change was necessary.
- Include relevant tests.
- Include proof of completion.
- Include documentation updates when necessary.
- Remain focused on the contribution being made.

Avoid large unrelated refactors unless they are specifically required for the contribution.

## PR Checklist

Before opening a Pull Request, make sure:

- [ ] The repository was forked from Vista.js.
- [ ] The branch was created from the latest `main`.
- [ ] The branch follows the `branch-name-username` naming format.
- [ ] The branch is focused on a single fix, feature, or contribution.
- [ ] The relevant issue is referenced, if applicable.
- [ ] Changed documentation mentions the correct repository URL: `https://github.com/vistakit/Vista-Js.git`
- [ ] Package versions are not bumped unless this is a release task.
- [ ] Committed `dist` output matches changed source where required.
- [ ] Relevant tests/builds have been run.
- [ ] Proof of completion has been provided.
- [ ] README or relevant documentation has been updated where necessary.
- [ ] The Pull Request targets `main`.
- [ ] The Pull Request explains what changed and why.
- [ ] No unrelated temporary files or local test applications have been included.

## Maintainer Review

All contributions are subject to review by the Vista.js maintainers.

Maintainers may:

- Request changes.
- Ask for additional tests.
- Request additional proof of completion.
- Request documentation updates.
- Ask contributors to split large Pull Requests.
- Reject changes that do not align with the project's direction or architecture.

For contributions submitted through the Mantitup contribution program, the Mantitup team may additionally verify the contribution before the first rollout.

## Need Help?

- Open an issue for bugs or feature requests.
- Start a draft Pull Request early if you want feedback on your approach.
- When in doubt, prefer smaller, reviewable changes over large refactors.
- If you are unsure whether a change fits the project, open an issue or draft Pull Request and explain your approach.
