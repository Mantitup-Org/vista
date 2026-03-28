---
category: "reference"
slug: "env"
title: "Environment Types"
summary: "What `vista-env.d.ts` is, why Vista generates it, and how image/CSS typing works."
order: 2
updatedAt: "2026-03-28"
---

## What `vista-env.d.ts` Does

Vista generates `vista-env.d.ts` so every app starts with the framework type references it needs for:

- `/// <reference types="vista" />`
- `/// <reference types="vista/image/image-types/global" />`
- CSS module declarations
- plain `.css` imports

That is why generated apps include:

```ts
/// <reference types="vista" />
/// <reference types="vista/image/image-types/global" />

// NOTE: This file should not be edited
// see https://vista.xyz/docs/env for more information.
```

## Should You Edit It?

No. Treat it like a framework-managed file.

If you need to change project typing, do it in:

- `tsconfig.json`
- your own `*.d.ts` files
- `vista.config.ts`

## Why The Image Types Matter

The `vista/image/image-types/global` reference gives static image imports the right TypeScript shape, so image usage stays consistent whether you render with the default engine or Flashpack.

## Related

- [Vista Config Reference](/docs/reference/vista-config-reference)
- [Engine Variants: Default vs Flashpack](/docs/reference/engine-variants-default-vs-flashpack)
