---
category: "core-concepts"
slug: "middleware"
title: "Middleware"
summary: "Intercept pages and API routes with global and route-specific middleware."
order: 5
updatedAt: "2026-09-05"
---

## Signatures

Vista accepts both a Next-style request argument and an explicit `{ request, next }` context:

```ts title="middleware.ts"
export async function middleware({ request, next }) {
  const token = request.cookies.get('session');
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return Response.redirect(new URL('/login', request.url));
  }

  const response = await next();
  response.headers.set('x-vista-mw', 'ok');
  return response;
}
```

Returning `next()` continues to the page or API route. Returning a `Response` with a non-200 status or a `Location` header stops the chain.

## Execution order

Middleware runs **parent to child**:

1. Project-root `middleware.ts` / `middleware.js`
2. `app/middleware.ts`
3. Nested `middleware.ts` files along the URL path (`app/dashboard/middleware.ts`, then `app/dashboard/settings/middleware.ts`)

The same chain runs for pages and `app/**/route.ts` API handlers.

## Route-specific files

```text
middleware.ts                 # global
app/middleware.ts             # all app routes
app/api/middleware.ts         # API routes only
app/dashboard/middleware.ts   # /dashboard and below
```

## Matcher

Optional `config.matcher` still works:

```ts
export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
```
