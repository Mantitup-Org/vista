"use strict";
/**
 * Next-compatible MetadataRoute helpers for robots.txt, sitemap.xml, and web manifests.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeRobots = serializeRobots;
exports.serializeSitemap = serializeSitemap;
exports.robots = robots;
exports.sitemap = sitemap;
exports.manifest = manifest;
exports.metadataRouteToResponse = metadataRouteToResponse;
function asArray(value) {
    if (value === undefined)
        return [];
    return Array.isArray(value) ? value : [value];
}
function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function formatLastModified(value) {
    if (!value)
        return undefined;
    if (value instanceof Date)
        return value.toISOString();
    return value;
}
/** Serialize a Robots object to robots.txt body text. */
function serializeRobots(data) {
    const rules = asArray(data.rules);
    const lines = [];
    for (const rule of rules) {
        const agents = asArray(rule.userAgent);
        if (agents.length === 0) {
            lines.push('User-agent: *');
        }
        else {
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
function serializeSitemap(entries) {
    const urls = entries
        .map((entry) => {
        const parts = [`<loc>${escapeXml(entry.url)}</loc>`];
        const lastmod = formatLastModified(entry.lastModified);
        if (lastmod)
            parts.push(`<lastmod>${escapeXml(lastmod)}</lastmod>`);
        if (entry.changeFrequency) {
            parts.push(`<changefreq>${escapeXml(entry.changeFrequency)}</changefreq>`);
        }
        if (typeof entry.priority === 'number') {
            parts.push(`<priority>${entry.priority}</priority>`);
        }
        if (entry.alternates?.languages) {
            for (const [lang, href] of Object.entries(entry.alternates.languages)) {
                parts.push(`<xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(href)}" />`);
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
function robots(data) {
    return new Response(serializeRobots(data), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': DEFAULT_CACHE,
        },
    });
}
/** Build a sitemap.xml Response. */
function sitemap(entries) {
    return new Response(serializeSitemap(entries), {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': DEFAULT_CACHE,
        },
    });
}
/** Build a webmanifest JSON Response. */
function manifest(data) {
    return new Response(JSON.stringify(data, null, 2), {
        headers: {
            'Content-Type': 'application/manifest+json; charset=utf-8',
            'Cache-Control': DEFAULT_CACHE,
        },
    });
}
/** Convert a MetadataRoute default-export payload into a Response. */
function metadataRouteToResponse(stem, payload) {
    if (payload instanceof Response)
        return payload;
    if (payload == null)
        return null;
    if (stem === 'robots' && typeof payload === 'object') {
        return robots(payload);
    }
    if (stem === 'sitemap' && Array.isArray(payload)) {
        return sitemap(payload);
    }
    if (stem === 'manifest' && typeof payload === 'object') {
        return manifest(payload);
    }
    return null;
}
