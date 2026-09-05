# Contributing to Vista.js

Thanks for helping improve Vista.js. This repo moves quickly, so the most helpful contributions are the ones that stay aligned with the current package/runtime architecture instead of older assumptions.

## Contribution Priorities

The repository contains a number of high-priority issues and feature requests. Contributors are encouraged to start with the listed issues before exploring additional improvements.

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

Listed issues will generally receive **higher priority during contribution evaluation**, especially issues explicitly marked as high priority.

## Ground Rules

- Never push directly to `main`.
- Start work from `development` unless a maintainer asks for a different base.
- Keep each branch focused on one fix, feature, or contribution.
- If you change published package source, rebuild the committed package output before opening a PR.
- Do not submit unrelated changes in the same PR unless they are necessary for the contribution.

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

Create your branch from `development`:

```bash
git checkout development
git pull origin development
git checkout -b feat/my-change
```

Use a descriptive branch name such as:

```text
fix/rsc-conformance-username
feat/ai-agent-username
docs/deployment-username
```

For contributions specifically requested by the Mantitup contribution program, use the required branch naming format:

```text
branch-name-username
```

Keep branch names short, descriptive, and related to the work being performed.

## Contribution Workflow

A recommended contribution workflow is:

1. Check the existing issues and identify a contribution you want to work on.
2. If you discover a problem that is not already listed, create an issue describing the problem before implementing a significant change.
3. Fork the repository and create a branch from `development`.
4. Implement the fix, feature, or improvement.
5. Run the relevant tests and builds.
6. Update the README or relevant documentation when the contribution changes user-facing behavior or introduces a new feature.
7. Provide clear proof that the contribution works.
8. Push your branch and open a Pull Request against `development`.
9. Clearly explain what changed, why it was needed, and how it was tested.
10. Respond to review feedback and keep the PR focused.

## Contribution Proof

Every contribution must include clear and verifiable proof of completion in the Pull Request.

Depending on the type of contribution, acceptable proof may include:

- A demo video showing the implemented feature or fix.
- A deployed link demonstrating the change.
- Screenshots or screen recordings showing the result.
- Relevant test output.
- Benchmark results, where applicable.
- Reproduction steps demonstrating that a bug has been fixed.
- Before-and-after comparisons.
- Any other clear and verifiable evidence that demonstrates the contribution works as intended.

For larger features, a **demo video or deployed example is strongly recommended**.

The proof should clearly demonstrate the contribution and, where applicable, reference the issue or feature being addressed.

Maintainers may request additional proof, reproduction steps, tests, or other evidence during review.

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

Choose the narrowest relevant checks first, then run the bigger suite before asking for review.

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
- Do not commit random temporary folders or local smoke apps.
- Do not commit generated files unless they are expected to be part of the repository.

## Repo Areas

- `packages/vista/`: framework package, CLI, runtime, build system, theme exports, cache APIs
- `packages/create-vista-app/`: scaffolding CLI and starter templates
- `apps/web/`: official site and docs at `vista.xyz`
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
- Reference the relevant issue when applicable.
- Explain what was changed.
- Explain why the change was necessary.
- Include relevant tests.
- Include proof of completion.
- Include documentation updates when necessary.
- Remain focused on the contribution being made.

Avoid large unrelated refactors unless they are specifically required for the contribution.

## PR Checklist

Before opening a PR, make sure:

- [ ] The branch is based on `development`.
- [ ] The branch is focused on a single fix, feature, or contribution.
- [ ] The relevant issue is referenced, if applicable.
- [ ] Changed docs mention the correct repo URL: `https://github.com/vistakit/Vista-Js.git`
- [ ] Package versions are not bumped unless this is a release task.
- [ ] Committed `dist` output matches changed source where required.
- [ ] Relevant tests/builds have been run.
- [ ] Proof of completion has been provided.
- [ ] README or relevant documentation has been updated where necessary.
- [ ] The PR explains what changed and why.
- [ ] No unrelated temporary files or local test applications have been included.

## Maintainer Review

All contributions are subject to review by the Vista.js maintainers.

Maintainers may:

- Request changes.
- Ask for additional tests.
- Request additional proof of completion.
- Request documentation updates.
- Ask contributors to split large PRs.
- Reject changes that do not align with the project's direction or architecture.

For contributions submitted through the Mantitup contribution program, the Mantitup team may additionally verify the contribution before the first rollout.

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

- Open an issue for bugs or feature requests.
- Start a draft PR early if you want feedback on direction.
- When in doubt, prefer smaller, reviewable changes over large refactors.
- If you are unsure whether a change fits the project, open an issue or draft PR and explain your approach.
