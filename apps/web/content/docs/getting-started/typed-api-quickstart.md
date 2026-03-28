---
category: "getting-started"
slug: "typed-api-quickstart"
title: "Typed API Quickstart"
summary: "Enable the experimental typed API flag and wire your first router in minutes with strongly typed contracts."
order: 3
updatedAt: "2026-03-04"
---

## Enable Typed API Runtime

```ts title="vista.config.ts"
const config = {
  experimental: {
    typedApi: {
      enabled: true,
      serialization: 'json',
      bodySizeLimitBytes: 1024 * 1024,
    },
  },
};

export default config;
```

## Create the Entry Router

```ts title="app/api/typed.ts"
import { vstack } from 'vista/stack';
import { createRootRouter } from './routers';

const v = vstack.init();
export const router = createRootRouter(v);
```

## Create a Procedure

```ts title="app/api/procedures/hello.ts"
import type { VStackInstance } from 'vista/stack';

export function helloProcedure(v: VStackInstance<any, any>) {
  return v.procedure.query(() => ({
    message: 'Hello from Vista Typed API',
  }));
}
```

## Call it from Client

```ts title="client usage"
import { createVistaClient } from 'vista/stack/client';
import { router } from '@/app/api/typed';

type AppRouter = typeof router;

const client = createVistaClient<AppRouter>({ baseUrl: 'http://localhost:3000/api' });
const response = await client.$get('/hello');
```

## Deep Dive
- [API Routes vs Typed API](/docs/core-concepts/api-routes-vs-typed-api)
- [Typed API Runtime Flow](/docs/core-concepts/typed-api-runtime-flow)
