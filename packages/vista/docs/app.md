# App conventions

Vista apps are React. Server Components are the default under `app/`. Add `'use client'` only on modules that use state, effects, or browser events.

## Routes

- `app/index.tsx` is the home page (`/`). There is no `app/page.tsx` convention.
- `app/root.tsx` is the root layout. There is no `app/layout.tsx` convention.
- A route segment is `app/<segment>/page.tsx` (for example `app/about/page.tsx` → `/about`).
- Dynamic segments use brackets: `app/docs/[...slug]/page.tsx`.
- HTTP handlers are `app/**/route.ts` exporting `GET`, `POST`, and the other methods.
- Shared UI is not scaffolded. Import theme pieces from `vista/theme` (`ThemeProvider`, `ThemeScript`, `ThemeToggle`). Add `components/` only when UI is reused.

## Client boundaries

`'use client'` may live in `app/`, `components/`, `utils/`, `lib/`, or `src/`. The client manifest scans those roots.

## Config and output

- `vista.config.ts` selects the engine with `engine.variant`: `'default'` or `'flashpack'`.
- `package.json` `vista.engine` is the same switch. Scripts stay `vista dev`, `vista build`, `vista start`.
- Production output is `.vista/` (the `.next` equivalent). Do not commit it.
- Flashpack dev output is `.flash/`. It is a compiler cache, not a second copy of `.vista/`.
- Dev server port is `3003`.

## SEO files already in a new app

- `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`
- Metadata helpers come from `vista` / `vista/metadata`. OG images use `vista/og`.
- `vista g seo` adds `app/manifest.ts` when it is missing.
