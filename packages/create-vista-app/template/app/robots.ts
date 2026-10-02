import { robots } from 'vista/metadata';

const siteUrl = process.env.VISTA_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003';

export default function robotsTxt() {
  return robots({
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: new URL(siteUrl).host,
  });
}
