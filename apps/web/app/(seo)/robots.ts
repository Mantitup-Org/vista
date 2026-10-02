import { robots } from 'vista/metadata';
import { siteUrl } from '../../lib/site';

export default function robotsTxt() {
  return robots({
    rules: {
      userAgent: '*',
      allow: '/',
    },
    host: new URL(siteUrl).host,
    sitemap: `${siteUrl}/sitemap.xml`,
  });
}
