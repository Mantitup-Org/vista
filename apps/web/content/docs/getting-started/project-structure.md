---
category: "getting-started"
slug: "project-structure"
title: "Project Structure"
summary: "Understand what each folder does so you can add routes, APIs, and shared logic without creating chaos."
order: 2
updatedAt: "2026-09-18"
---

## Baseline Structure

```txt title="Typical Vista app tree"
my-app/
  app/
    root.tsx
    index.tsx
    signin/page.tsx      # from vista g auth
    account/page.tsx
    api/
      health/route.ts
      typed.ts
      auth/[...vista]/route.ts
    agents/              # from vista g agent
  components/
    theme-toggle.tsx     # 'use client' — scanned even outside app/
  utils/
  lib/
  public/
  auth.ts
  middleware.ts
  .env.example
  vista.config.ts
```

## Folder Responsibilities

- `app/` contains routes and route-local UI.
- `components/`, `utils/`, `lib/`, and `src/` may contain `'use client'` modules; the client manifest scans those extra roots (not only `app/`).
- `lib/` contains pure helpers and adapters.
- `app/api/` is for HTTP APIs, route handlers, and the typed API entrypoint.
- `app/agents/` is for runtime AI agents (`vista g agent`).
- `auth.ts` + `middleware.ts` + `/signin` appear when you run `vista g auth`.

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
