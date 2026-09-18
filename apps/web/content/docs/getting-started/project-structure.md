---
category: "getting-started"
slug: "project-structure"
title: "Project Structure"
summary: "Understand what each folder does so you can add routes, APIs, and shared logic without creating chaos."
order: 2
updatedAt: "2026-03-04"
---

## Baseline Structure

```txt title="Typical Vista app tree"
my-app/
  app/
    root.tsx
    index.tsx
    docs/
      page.tsx
      [...slug]/page.tsx
    api/
      health/route.ts
      typed.ts
  components/
  lib/
  data/
  public/
  vista.config.ts
```

## Folder Responsibilities

- `app/` contains routes and route-local UI.
- `components/` contains reusable UI building blocks.
- `lib/` contains pure helpers and adapters.
- `data/` contains local data maps like docs catalogs or feature lists.
- `app/api/` is for HTTP APIs, legacy route handlers, and typed API entrypoint.
- `app/agents/` is for runtime AI agents (`vista g agent`).
- `auth.ts` + `middleware.ts` appear when you add auth/guards.

## Build paths

- UI only → [React App](/docs/getting-started/react-app)
- APIs / auth → [Fullstack App](/docs/getting-started/fullstack-app)
- Chat / tools → [AI Overview](/docs/ai/overview)
- Grounded docs chat → [RAG](/docs/ai/rag)

## Recommended Team Rule

> Put code where you would expect to find it in 3 months, not where it was quickest today.

## Next
- [Typed API Quickstart](/docs/getting-started/typed-api-quickstart)
- [Project File Structure Reference](/docs/reference/project-file-structure)
