---
category: "deployment"
slug: "vercel-deployment"
title: "Vercel Deployment (Experimental)"
summary: "Vercel setup is available, but should be treated as experimental right now for Vista apps."
order: 3
updatedAt: "2026-03-04"
---

> Caution: Vercel support is not fully stable yet. Use Render for production-critical deployments.

You can deploy Vista on Vercel, but treat it as beta. Keep fallback plan ready and validate every release with preview builds.

## vercel.json Setup

```json title="vercel.json"
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": ".vista",
  "framework": null,
  "installCommand": "npm install --legacy-peer-deps --no-audit --no-fund",
  "devCommand": "npm run dev"
}
```

## Known Risks

- Dependency resolution can vary between builds.
- React/RSC + custom runtime integration may behave differently than standard Next.js pipelines.
- Large runtime changes in Vista may require deploy config updates.

## Recommendation

For client projects and production SLAs, deploy on Render first. Use Vercel for preview/testing until Vista Vercel support is marked stable.

## Related
- [Render Deployment (Recommended)](/docs/deployment/render-deployment)
- [Vista Config Reference](/docs/reference/vista-config-reference)
