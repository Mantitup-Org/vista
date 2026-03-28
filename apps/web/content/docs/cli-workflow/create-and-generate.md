---
category: "cli-workflow"
slug: "create-and-generate"
title: "Create and Generate"
summary: "Use `create-vista-app` for fast project bootstrap, then add new modules with a repeatable CLI-driven workflow."
order: 1
updatedAt: "2026-03-04"
---

## Bootstrap App

```bash
npx create-vista-app@latest
cd my-vista-app
npm run dev
```

In interactive mode, `create-vista-app` now prompts for:

- engine: `default` or `flashpack`
- package manager: `npm`, `pnpm`, `yarn`, or `bun`

Dependencies install automatically by default after scaffold. Use `--skip-install` when you only want the files without downloading packages yet.

To choose the Rust-first engine during scaffold:

```bash
npx create-vista-app@latest my-vista-app --engine flashpack
```

To pick a package manager explicitly without the prompt:

```bash
npx create-vista-app@latest my-vista-app --package-manager pnpm
```

Shortcut flags also work:

- `--npm`
- `--pnpm`
- `--yarn`
- `--bun`

Generated apps always keep the same scripts:

- `npm run dev`
- `npm run build`
- `npm run start`

The selected engine is stored in `vista.config.ts`, so switching engines later is a config change instead of a script rename.

## Typed Starter

Typed starter scaffolds `app/api/typed.ts`, `app/api/routers`, and `app/api/procedures` so your API contract starts strongly typed from day one.

## Suggested Team Workflow

- Create feature route in `app/<feature>/` first.
- Extract shared UI into `components/` only after second reuse.
- Add server logic in `app/api/procedures/` and expose from router.
- Keep release scripts in `package.json` so CI and local run identical commands.

## Related
- [Project Structure](/docs/getting-started/project-structure)
- [Engine Variants: Default vs Flashpack](/docs/reference/engine-variants-default-vs-flashpack)
- [Render Deployment (Recommended)](/docs/deployment/render-deployment)
