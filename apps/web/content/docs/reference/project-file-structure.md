---
category: "reference"
slug: "project-file-structure"
title: "Project File Structure"
summary: "Detailed map of important Vista folders and how runtime, routes, and docs content connect to each other."
order: 2
updatedAt: "2026-03-04"
---

## Runtime-Facing Files

```txt
app/root.tsx                -> global shell
app/index.tsx               -> home route
app/docs/layout.tsx         -> docs shell (sidebar + TOC)
app/docs/[...slug]/page.tsx -> docs article resolver
app/api/*                   -> REST + typed API entry
```

## Docs Content Files

```txt
content/docs/categories.ts                 -> category registry
content/docs/**/<doc>.md                   -> doc section data
content/docs/index.ts                      -> allDocs collector
lib/docs.ts                                -> slug resolver + navigation helpers
```

## Typed API Files

```txt
app/api/typed.ts                          -> typed router entry
app/api/routers/index.ts                   -> compose procedures
app/api/procedures/*.ts                    -> query/mutation handlers
```

## What to Keep Stable

- Do not rename `/docs/<category>/<slug>` contract once public links exist.
- Keep docs category IDs stable; they are used in navigation generation.
- Prefer app-local utilities before extracting framework-level helpers.

## See Also
- [Project Structure](/docs/getting-started/project-structure)
- [Dynamic Routes and Slugs](/docs/core-concepts/dynamic-routes-and-slugs)
