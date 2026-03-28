---
category: "core-concepts"
slug: "typed-api-runtime-flow"
title: "Typed API Runtime Flow"
summary: "Follow the exact request lifecycle from incoming `/api/*` call to router execution and serialized response."
order: 4
updatedAt: "2026-03-04"
---

## Entrypoint Discovery

Runtime scans for `app/api/typed.ts` (and JS/TSX variants). If file is missing, typed API handling is skipped.

## Path + Method Resolution

- Request path candidates include both raw path and `/api`-stripped path.
- Router checks matching procedure by normalized method (`get`/`post`).
- No method match with existing route map returns 405.
- No route match returns not-found and allows fallback.

## Body Parsing Rules

- `application/json` and `+json` parse into objects.
- `application/x-www-form-urlencoded` parses via `URLSearchParams`.
- `text/*` returns UTF-8 string.
- Other content types return Buffer payload.

## Context and Environment Factories

```ts title="typed entrypoint optional exports"
export async function createContext({ req, res }) {
  return { userId: req.headers['x-user-id'] ?? null };
}

export function createEnv() {
  return { mode: process.env.NODE_ENV ?? 'development' };
}
```

## Error Mapping

- Validation and method errors map to 4xx responses with message.
- Body size violations map to 413.
- Unhandled runtime errors map to 500.
- Router-level error handler can return custom `Response` for central handling.

## Continue
- [Typed API Quickstart](/docs/getting-started/typed-api-quickstart)
- [API Routes vs Typed API](/docs/core-concepts/api-routes-vs-typed-api)
