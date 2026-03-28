---
category: "getting-started"
slug: "first-steps"
title: "First Steps"
summary: "Bootstrap a new app, run local dev, and understand the minimum project structure in minutes."
order: 1
updatedAt: "2026-03-04"
---

## Create an App

```bash title="Terminal"
npx create-vista-app@latest
cd my-vista-app
npm run dev
```

## Project Shape

- `app/` contains pages and layouts.
- `components/` stores reusable UI.
- `data/` and `lib/` keep content + helpers clean.

## What to Build First

Start with one route, one layout, and one data source. Keep scope tight until your core loop is stable.

## First API Implementation

```ts title="app/api/health/route.ts"
export async function GET() {
  return Response.json({
    ok: true,
    framework: 'vista',
    timestamp: Date.now(),
  });
}
```

## Continue
- [Routing Overview](/docs/core-concepts/routing-overview)
- [Project Structure](/docs/getting-started/project-structure)
- [Typed API Quickstart](/docs/getting-started/typed-api-quickstart)
