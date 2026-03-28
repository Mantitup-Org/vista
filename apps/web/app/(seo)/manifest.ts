import { siteDescription, siteName } from '../../lib/site';

export function GET() {
  const body = JSON.stringify(
    {
      name: siteName,
      short_name: siteName,
      description: siteDescription,
      start_url: '/',
      display: 'standalone',
      background_color: '#000000',
      theme_color: '#000000',
      icons: [
        {
          src: '/favicon.ico',
          sizes: '48x48',
          type: 'image/x-icon',
        },
      ],
    },
    null,
    2
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
