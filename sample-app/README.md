# My Vista App

Built with [Vista.js](https://github.com/Mantitup-Org/vista) — the React framework powered by Rust.

Selected engine for this app: `default`

Typed API starter: `disabled`

## Getting Started

Run the development server:

```bash
npm run dev
# or
pnpm dev
```

Open [http://localhost:3003](http://localhost:3003) in your browser.

If you want typed API starter files in a fresh app:

```bash
npx create-vista-app@latest my-vista-app --typed-api
```

## Project Structure

```
app/
├── root.tsx        # Root layout (<html>, <body>, fonts)
├── index.tsx        # Full-stack notes page backed by the notes API
├── globals.css     # Global styles (Tailwind CSS v4)
└── api/
    └── notes/
        ├── route.ts       # GET/POST /api/notes
        ├── [id]/route.ts   # GET/PATCH/DELETE /api/notes/:id
        └── notes-store.ts  # Server-only in-memory data store
public/
├── vista.svg       # Static assets
vista.config.ts     # Framework configuration
```

## Full-stack example

The home page fetches `/api/notes` on each request and renders the response from
the same file-based API backed by `notes-store.ts`. This demonstrates the full
page -> API route -> server store boundary without adding a second backend service.

Try the API while the dev server is running:

```text
GET    /api/notes
POST   /api/notes
GET    /api/notes/1
PATCH  /api/notes/1
DELETE /api/notes/1
```

The store is intentionally in memory and deterministic for the example. The page
is explicitly dynamic so mutations made through the API are visible on the next
page request. Replace `notes-store.ts` with a database-backed module in a real
application.

## Key Concepts

- **`app/root.tsx`** — Root layout that wraps every page. Defines `<html>`, fonts, and metadata.
- **`app/index.tsx`** or **`app/page.tsx`** — Page components. Each folder = a route.
- **`'use client'`** — Add this directive to make a component interactive (client-side).
- **Server Components** — All components are server components by default (zero JS sent to browser).

## Available Commands

| Command       | Description                       |
| ------------- | --------------------------------- |
| `vista dev`   | Start dev server with the engine selected in `vista.config.ts` |
| `vista build` | Create production build with the engine selected in `vista.config.ts` |
| `vista start` | Start production server with the engine selected in `vista.config.ts` |
| `vista g api-init` | Generate typed API starter files |
| `vista g router <name>` | Generate a typed router file |
| `vista g procedure <name> [get\|post]` | Generate a typed procedure file |

## Engine Selection

`create-vista-app` supports both engine variants:

- `default` (webpack path)
- `flashpack` (Rust-first path)

You can choose at scaffold time, but the generated app still uses the same `npm run dev`, `npm run build`, and `npm run start` scripts. Vista reads the selected engine from `vista.config.ts`.

Example:

```bash
npx create-vista-app@latest my-vista-app --engine flashpack
```

The generated config looks like:

```ts
engine: {
  variant: 'flashpack'
}
```

Flashpack engine runtime/cache artifacts are stored in `.flash/`.

## Typed API Rollback

Typed API is experimental and can be disabled anytime from `vista.config.ts`:

```ts
experimental: {
  typedApi: {
    enabled: false
  }
}
```

## Learn More

- [Vista.js GitHub](https://github.com/Mantitup-Org/vista)
- [React Server Components](https://react.dev/reference/rsc/server-components)
- [Tailwind CSS v4](https://tailwindcss.com)
