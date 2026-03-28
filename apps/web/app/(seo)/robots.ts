import { siteUrl } from '../../lib/site';

export function GET() {
  const body = `User-agent: *
Allow: /

Host: ${new URL(siteUrl).host}
Sitemap: ${siteUrl}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
