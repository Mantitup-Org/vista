---
category: "seo"
slug: "metadata"
title: "Metadata and SEO"
summary: "Use Vista's Next-shaped metadata API, robots/sitemap helpers, OG images, and JSON-LD for crawlable SSR HTML."
order: 1
updatedAt: "2026-09-21"
---

## Why Vista ranks

Vista SSR/SSG-renders real HTML. Put titles, descriptions, canonicals, and structured data in metadata (or `generateMetadata`) and they land in the document head on every request — not only after client hydration.

## Static `metadata` and `generateMetadata`

```tsx title="app/root.tsx"
import type { Metadata } from 'vista'

export const metadata: Metadata = {
  metadataBase: new URL('https://example.com'),
  title: {
    default: 'My App',
    template: '%s | My App',
  },
  description: 'Built with Vista',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
  },
  other: {
    'theme-color': '#111111',
  },
}
```

Nested layouts and pages deep-merge. Title templates inherit from parents. Page-level fields win on scalars; nested `openGraph`, `twitter`, `robots`, `alternates`, and `icons` merge.

```tsx title="app/docs/[...slug]/page.tsx"
import type { Metadata } from 'vista'

export async function generateMetadata({ params }): Promise<Metadata> {
  const doc = await loadDoc(params)
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: `/docs/${doc.slug}` },
  }
}
```

Import helpers from `vista` or `vista/metadata`.

## Robots, sitemap, and manifest

Scaffold with:

```bash title="Terminal"
vista g seo
```

That writes `app/robots.ts`, `app/sitemap.ts`, and `app/manifest.ts` using typed helpers:

```ts title="app/robots.ts"
import { robots } from 'vista/metadata'

export default function robotsTxt() {
  return robots({
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://example.com/sitemap.xml',
  })
}
```

```ts title="app/sitemap.ts"
import { sitemap } from 'vista/metadata'

export default function sitemapXml() {
  return sitemap([
    { url: 'https://example.com', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
  ])
}
```

Routes resolve to `/robots.txt`, `/sitemap.xml`, and `/manifest.webmanifest`. You can also export `GET` that returns the helper `Response`, or a Next-style default that returns plain data — Vista serializes both.

Set `VISTA_SITE_URL` (or `NEXT_PUBLIC_SITE_URL`) for absolute URLs in starters.

## Open Graph images

Add `app/opengraph-image.tsx` (or `twitter-image.tsx`) in any route segment:

```tsx title="app/opengraph-image.tsx"
import { ImageResponse } from 'vista/og'

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ fontSize: 64, background: '#111', color: '#fff', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        My App
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
```

Point metadata at `/opengraph-image`. Static files like `opengraph-image.png` work the same way. `ImageResponse` uses Satori + resvg (same stack as Next).

## JSON-LD

```tsx
import { JsonLd } from 'vista/metadata'

export default function Page() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: 'Hello',
        }}
      />
      {/* page */}
    </>
  )
}
```

`jsonLd(data)` returns the serialized string if you need to embed it yourself. Angle brackets are escaped for XSS safety.

## Checklist

- Unique `title`, `description`, and `alternates.canonical` per important URL
- `metadataBase` so relative OG/canonical URLs resolve
- `/robots.txt` + `/sitemap.xml` from day one (`vista g seo` or starter defaults)
- Raster OG image (1200×630) via `opengraph-image` or PNG
- Article/WebSite JSON-LD where it helps rich results

## Related

- [Build a React App](/docs/getting-started/react-app)
- [Create and Generate](/docs/cli-workflow/create-and-generate)
- [Project Structure](/docs/getting-started/project-structure)
