---
category: "getting-started"
slug: "fullstack-app"
title: "Build a Fullstack App"
summary: "Add APIs, typed procedures, auth, and middleware in the same Vista app that serves your React UI."
order: 5
updatedAt: "2026-09-18"
---

A fullstack Vista app is still one React project. The backend lives under `app/api/` (and optional root `auth.ts` / `middleware.ts`). You do not start a second Node server.

## Path A — File-based API routes

Create `app/api/<name>/route.ts` and export HTTP methods:

```ts title="app/api/notes/route.ts"
export async function GET() {
  return Response.json({ notes: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ note: body }, { status: 201 });
}
```

Dynamic segments match pages:

```ts title="app/api/notes/[id]/route.ts"
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return Response.json({ id: params.id });
}
```

These handlers are server-only. Secrets and database clients imported here stay off the client bundle.

## Path B — Typed API (`vista/stack`)

Use this when you want shared types between procedures and callers.

```bash
vista g api-init
```

That writes `app/api/typed.ts`, routers, and a health procedure. Enable it in `vista.config.ts`:

```ts
experimental: {
  typedApi: {
    enabled: true,
  },
}
```

Call from a Server Component without HTTP:

```ts
import { vstack } from 'vista/stack';
import { router } from '@/app/api/typed';

const v = vstack.init();
const caller = v.createCaller(router, { ctx: {}, env: {} });
const result = await caller.health();
```

Call from the browser with `createVistaClient` from `vista/stack/client`.

## Path C — Auth

```bash
vista g auth
```

Creates:

- `auth.ts` and `app/api/auth/[...vista]/route.ts`
- `/signin` (credentials POST + OAuth) and `/account`
- `middleware.ts` that fail-closes `/account` when there is no session
- `components/auth-session-provider.tsx` (wired into `app/root.tsx` when that file is the default template)
- `.env.example`

Set `AUTH_SECRET`, then:

```ts title="auth.ts"
import VistaAuth, { GitHub, Google, Credentials } from 'vista/auth';

export const { handlers, auth, signIn, signOut, authMiddleware } = VistaAuth({
  pages: { signIn: '/signin' },
  providers: [
    GitHub({}),
    Google({}),
    Credentials({
      authorize: async ({ email, password }) => {
        if (email === 'you@example.com' && password === 'secret') {
          return { id: '1', email, name: 'You' };
        }
        return null;
      },
    }),
  ],
});
```

In a Server Component or route handler:

```ts
const session = await auth();
```

On the client, wrap the tree with `SessionProvider` (the generator does this) then:

```ts
import { useSession, signIn, signOut } from 'vista/auth/react';

await signIn('credentials', { email, password, callbackUrl: '/account' });
await signIn('github', { callbackUrl: '/account' });
```

`signIn('credentials')` POSTs with a CSRF token. OAuth honors `callbackUrl`.

## Path D — Middleware

```ts title="middleware.ts"
import { authMiddleware } from './auth';

export default authMiddleware(({ auth, request }) => {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/account') && !auth) {
    return false;
  }
  return true;
});
```

The file must export a function (`middleware` or `default`). An empty `middleware.ts` now fails closed (500) instead of skipping auth.

## Suggested order

1. Ship UI routes first ([React App](/docs/getting-started/react-app)).
2. Add one `route.ts` for a real HTTP need.
3. Promote stable APIs to typed procedures with `vista g api-init`.
4. Add `vista g auth` when you need sessions.
5. Protect paths with root `middleware.ts`.

## Related
- [Typed API Quickstart](/docs/getting-started/typed-api-quickstart)
- [API Routes vs Typed API](/docs/core-concepts/api-routes-vs-typed-api)
- [Authentication](/docs/auth/overview)
- [Create and Generate](/docs/cli-workflow/create-and-generate)
