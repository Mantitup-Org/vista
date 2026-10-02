import { sitemap } from 'vista/metadata';
import { getSiteMapEntries } from '../../lib/site';

export default function sitemapXml() {
  return sitemap(
    getSiteMapEntries().map((entry) => ({
      url: entry.url,
      lastModified: entry.lastModified,
      changeFrequency: 'weekly' as const,
      priority: entry.url === 'https://vista.xyz' || entry.url === 'https://vista.xyz/' ? 1 : 0.7,
    }))
  );
}
