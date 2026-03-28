---
category: "core-concepts"
slug: "routing-overview"
title: "Routing Overview"
summary: "Understand static, dynamic, and catch-all routes so app structure scales without rewrites."
order: 1
updatedAt: "2026-03-04"
---

## Static Route

```txt
app/docs/page.tsx -> /docs
```

## Dynamic Segment

```txt
app/blog/[slug]/page.tsx -> /blog/my-post
```

## Catch-All Segment

```txt
app/docs/[...slug]/page.tsx -> /docs/category/article
```

Catch-all routes are useful for docs IA where category + article path comes from content data.

## Related
- [Dynamic Routes and Slugs](/docs/core-concepts/dynamic-routes-and-slugs)
- [Project File Structure](/docs/reference/project-file-structure)
