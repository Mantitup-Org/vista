import { sitemap } from 'vista/metadata';

const siteUrl = process.env.VISTA_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003';

export default function sitemapXml() {
  return sitemap([
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]);
}
