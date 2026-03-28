---
category: "core-concepts"
slug: "dynamic-routes-and-slugs"
title: "Dynamic Routes and Slugs"
summary: "Use dynamic segments and catch-all routes to build scalable URL systems for docs, blogs, and dashboards."
order: 2
updatedAt: "2026-03-04"
---

## Dynamic Segment

```txt
app/blog/[slug]/page.tsx -> /blog/ship-log
```

## Catch-All Segment

```txt
app/docs/[...slug]/page.tsx -> /docs/introduction/the-beginning-of-vista
```

## Param Normalization Pattern

```ts
type RouteParams = Record<string, string | string[] | undefined | null>;

function normalizeDocRouteSlug(params: RouteParams): string[] {
  const raw = params.slug;
  if (Array.isArray(raw)) return raw.flatMap((entry) => entry.split('/')).filter(Boolean);
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  return [];
}
```

This normalization keeps behavior consistent when runtime adapters provide catch-all params in slightly different shapes.

## Related
- [Routing Overview](/docs/core-concepts/routing-overview)
- [Project File Structure](/docs/reference/project-file-structure)
