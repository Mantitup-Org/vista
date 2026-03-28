---
category: "reference"
slug: "typed-client-reference"
title: "Typed Client Reference"
summary: "Use `createVistaClient<AppRouter>()` with `$get`, `$post`, and `$url` helpers for typed request contracts."
order: 3
updatedAt: "2026-03-04"
---

## Client Initialization

```ts
import { createVistaClient } from 'vista/stack/client';
import { router } from '@/app/api/typed';

type AppRouter = typeof router;

const client = createVistaClient<AppRouter>({
  baseUrl: '/api',
  serialization: 'json',
});
```

## Request Helpers

- `client.$get(path, input?)` for read operations.
- `client.$post(path, input?)` for write operations.
- `client.$url(path, input?)` when you need a fully built URL.

## Error Shape

Failed requests throw `VistaClientError` with status, message, path, method, url, and optional details payload.

```ts
try {
  await client.$post('/users/create', { email: 'hello@vista.xyz' });
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  }
}
```

## Related
- [Typed API Quickstart](/docs/getting-started/typed-api-quickstart)
- [API Routes vs Typed API](/docs/core-concepts/api-routes-vs-typed-api)
