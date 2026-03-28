import { getSiteMapEntries } from '../../lib/site';

export function GET() {
  const urls = getSiteMapEntries()
    .map(
      (entry) => `<url><loc>${entry.url}</loc>${
        entry.lastModified ? `<lastmod>${entry.lastModified}</lastmod>` : ''
      }</url>`
    )
    .join('');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
