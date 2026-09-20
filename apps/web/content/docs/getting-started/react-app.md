---
category: "getting-started"
slug: "react-app"
title: "Build a React App"
summary: "Use Vista like a normal React App Router project: pages, layouts, Server Components, and client UI."
order: 4
updatedAt: "2026-09-18"
---

Vista is a React framework. If you only need UI and routing, you do not need APIs, auth, or AI.

## Create the app

```bash
npx create-vista-app@latest my-app
cd my-app
npm run dev
```

Open `http://localhost:3003`.

## Mental model

- Folders under `app/` (or `src/app/`) are URL routes.
- Components are **Server Components** by default.
- Add `'use client'` only where you need browser state, events, or hooks. Files in `components/`, `utils/`, `lib/`, or `src/` are scanned into the client manifest — they do not have to live under `app/`.
- Shared UI goes in `components/` (or `src/components/` when you choose the `src/` layout).

```txt
my-app/
  app/                 # or src/app/ if you answered yes to "Use a src/ directory?"
    root.tsx           # shared layout
    index.tsx          # /
    about/page.tsx     # /about
  components/          # or src/components/
  public/
  vista.config.ts
```

Create with the `src/` layout:

```bash
npx create-vista-app@latest my-app --src-dir
```

Interactive create also asks: **Would you like to use a `src/` directory?**

## Server page

```tsx title="app/about/page.tsx"
export default function AboutPage() {
  return (
    <main>
      <h1>About</h1>
      <p>This HTML is rendered on the server.</p>
    </main>
  );
}
```

## Client interactivity

```tsx title="components/counter.tsx"
'use client';

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      Clicked {count}
    </button>
  );
}
```

Import that counter from a page. The page can stay a Server Component.

## Layout, theme, navigation

```tsx title="app/root.tsx"
import { ThemeProvider, ThemeScript } from 'vista/theme';
import Link from 'vista/link';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <nav>
            <Link href="/">Home</Link>
            <Link href="/about">About</Link>
          </nav>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

## Commands you will use

| Command | What it does |
| --- | --- |
| `npm run dev` | Local development |
| `npm run build` | Production build into `.vista/` |
| `npm run start` | Serve the production build |

## When to go further

- Need HTTP handlers or typed backend procedures → [Fullstack App](/docs/getting-started/fullstack-app)
- Need chat / tools / models → [AI Overview](/docs/ai/overview)
- Need answers grounded in your docs → [RAG](/docs/ai/rag)

## Related
- [First Steps](/docs/getting-started/first-steps)
- [Project Structure](/docs/getting-started/project-structure)
- [Routing Overview](/docs/core-concepts/routing-overview)
