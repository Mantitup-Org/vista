---
category: "core-concepts"
slug: "api-routes-vs-typed-api"
title: "API Routes vs Typed API"
summary: "Vista supports both classic route handlers and the new typed API runtime so teams can migrate incrementally."
order: 3
updatedAt: "2026-03-04"
---

## Legacy Route Handlers

Keep using `app/api/*/route.ts` for traditional endpoint files. Existing projects continue to work without any changes.

```ts title="app/api/health/route.ts"
export async function GET() {
  return Response.json({ ok: true, uptime: process.uptime() });
}
```

## Typed API Runtime

Typed API routes are enabled only when `experimental.typedApi.enabled` is true. Runtime matches methods, validates input, executes middleware, and serializes output.

```ts title="app/api/typed.ts"
import { vstack } from 'vista/stack';
import { createRootRouter } from './routers';

const v = vstack.init();
export const router = createRootRouter(v);
```

## How Request Resolution Works

- If a concrete `app/api/*` route file exists, legacy handler path stays valid.
- Typed runtime checks exported router from `app/api/typed.ts` entrypoint.
- Unknown typed route returns not-found and allows legacy fallback.
- Method mismatch returns 405 with typed error payload.

## Next
- [Typed API Runtime Flow](/docs/core-concepts/typed-api-runtime-flow)
- [Vista Config Reference](/docs/reference/vista-config-reference)
