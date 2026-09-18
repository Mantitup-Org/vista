---
category: "auth"
slug: "overview"
title: "Authentication"
summary: "NextAuth-shaped sessions, OAuth PKCE, credentials CSRF, and auth() for Server Components."
order: 1
updatedAt: "2026-09-18"
---

Vista ships a NextAuth-shaped auth helper at `vista/auth`. It is designed to be easy to wire and safe by default: encrypted JWT session cookies, CSRF on credential POSTs, PKCE for OAuth, and `auth()` in Server Components.

## Quick start

```bash
vista g auth
```

That creates `auth.ts` and `app/api/auth/[...vista]/route.ts`. Set `AUTH_SECRET` (required), plus provider keys.

```ts title="auth.ts"
import VistaAuth, { Credentials, GitHub, Google } from 'vista/auth';

export const { handlers, auth, signIn, signOut, authMiddleware } = VistaAuth({
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

```ts title="app/api/auth/[...vista]/route.ts"
import { handlers } from '../../../../auth';
export const { GET, POST } = handlers;
```

## Usage

- Server Components / route handlers: `const session = await auth()`
- Middleware: `export default authMiddleware(({ auth }) => Boolean(auth))`
- Client: `import { SessionProvider, useSession, signIn, signOut } from 'vista/auth/react'`

Session cookies are HttpOnly, `SameSite=Lax`, `Secure` in production, and encrypted with AES-256-GCM using `AUTH_SECRET`.

## Related
- [Create and Generate](/docs/cli-workflow/create-and-generate)
- [Routing Overview](/docs/core-concepts/routing-overview)
