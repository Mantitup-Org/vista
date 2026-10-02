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
export declare namespace MetadataRoute {
    type Robots = RobotsFile;
    type Sitemap = SitemapFile;
    type Manifest = ManifestFile;
}
/** Serialize a Robots object to robots.txt body text. */
export declare function serializeRobots(data: RobotsFile): string;
/** Serialize sitemap entries to XML. */
export declare function serializeSitemap(entries: SitemapFile): string;
/** Build a robots.txt Response. */
export declare function robots(data: RobotsFile): Response;
/** Build a sitemap.xml Response. */
export declare function sitemap(entries: SitemapFile): Response;
/** Build a webmanifest JSON Response. */
export declare function manifest(data: ManifestFile): Response;
/** Convert a MetadataRoute default-export payload into a Response. */
export declare function metadataRouteToResponse(stem: 'robots' | 'sitemap' | 'manifest', payload: unknown): Response | null;
