/**
 * Next-compatible MetadataRoute helpers for robots.txt, sitemap.xml, and web manifests.
 */

export type RobotsRule = {
  userAgent?: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
  crawlDelay?: number;
  other?: Record<string, string | number | Array<string | number>>;
};

export type RobotsFile = {
  rules: RobotsRule | RobotsRule[];
  sitemap?: string | string[];
  host?: string;
};

export type SitemapEntry = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  alternates?: {
    languages?: Record<string, string>;
  };
  images?: string[];
  videos?: Array<{
    title: string;
    thumbnail_loc: string;
    description: string;
  }>;
};

export type SitemapFile = SitemapEntry[];

export type ManifestIcon = {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
};

export type ManifestFile = {
  name?: string;
  short_name?: string;
  description?: string;
  start_url?: string;
  display?: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser';
  background_color?: string;
  theme_color?: string;
  icons?: ManifestIcon[];
  [key: string]: unknown;
};

/** Namespace mirroring Next.js `MetadataRoute`. */
export namespace MetadataRoute {
  export type Robots = RobotsFile;
  export type Sitemap = SitemapFile;
  export type Manifest = ManifestFile;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatLastModified(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Serialize a Robots object to robots.txt body text. */
export function serializeRobots(data: RobotsFile): string {
  const rules = asArray(data.rules);
  const lines: string[] = [];

  for (const rule of rules) {
    const agents = asArray(rule.userAgent);
    if (agents.length === 0) {
      lines.push('User-agent: *');
    } else {
      for (const agent of agents) {
        lines.push(`User-agent: ${agent}`);
      }
    }

    for (const allow of asArray(rule.allow)) {
      lines.push(`Allow: ${allow}`);
    }
    for (const disallow of asArray(rule.disallow)) {
      lines.push(`Disallow: ${disallow}`);
    }
    if (typeof rule.crawlDelay === 'number') {
      lines.push(`Crawl-delay: ${rule.crawlDelay}`);
    }
    if (rule.other) {
      for (const [key, raw] of Object.entries(rule.other)) {
        for (const entry of asArray(raw)) {
          lines.push(`${key}: ${entry}`);
        }
      }
    }
    lines.push('');
  }

  if (data.host) {
    lines.push(`Host: ${data.host}`);
  }
  for (const sitemapUrl of asArray(data.sitemap)) {
    lines.push(`Sitemap: ${sitemapUrl}`);
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/** Serialize sitemap entries to XML. */
export function serializeSitemap(entries: SitemapFile): string {
  const urls = entries
    .map((entry) => {
      const parts = [`<loc>${escapeXml(entry.url)}</loc>`];
      const lastmod = formatLastModified(entry.lastModified);
      if (lastmod) parts.push(`<lastmod>${escapeXml(lastmod)}</lastmod>`);
      if (entry.changeFrequency) {
        parts.push(`<changefreq>${escapeXml(entry.changeFrequency)}</changefreq>`);
      }
      if (typeof entry.priority === 'number') {
        parts.push(`<priority>${entry.priority}</priority>`);
      }
      if (entry.alternates?.languages) {
        for (const [lang, href] of Object.entries(entry.alternates.languages)) {
          parts.push(
            `<xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(href)}" />`
          );
        }
      }
      for (const image of entry.images || []) {
        parts.push(`<image:image><image:loc>${escapeXml(image)}</image:loc></image:image>`);
      }
      return `<url>${parts.join('')}</url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;
}

const DEFAULT_CACHE = 'public, max-age=0, s-maxage=3600';

/** Build a robots.txt Response. */
export function robots(data: RobotsFile): Response {
  return new Response(serializeRobots(data), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': DEFAULT_CACHE,
    },
  });
}

/** Build a sitemap.xml Response. */
export function sitemap(entries: SitemapFile): Response {
  return new Response(serializeSitemap(entries), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': DEFAULT_CACHE,
    },
  });
}

/** Build a webmanifest JSON Response. */
export function manifest(data: ManifestFile): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': DEFAULT_CACHE,
    },
  });
}

/** Convert a MetadataRoute default-export payload into a Response. */
export function metadataRouteToResponse(
  stem: 'robots' | 'sitemap' | 'manifest',
  payload: unknown
): Response | null {
  if (payload instanceof Response) return payload;
  if (payload == null) return null;

  if (stem === 'robots' && typeof payload === 'object') {
    return robots(payload as RobotsFile);
  }
  if (stem === 'sitemap' && Array.isArray(payload)) {
    return sitemap(payload as SitemapFile);
  }
  if (stem === 'manifest' && typeof payload === 'object') {
    return manifest(payload as ManifestFile);
  }

  return null;
}
