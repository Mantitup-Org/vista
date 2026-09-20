/**
 * Vista Static Generator
 *
 * Pre-renders pages at build time for SSG and ISR routes.
 * Works with both the RSC pipeline (Flight payloads) and
 * legacy SSR (renderToString).
 *
 * Called after webpack compilation completes in `buildRSC()`.
 */
import type { RouteEntry, ServerManifest } from '../build/rsc/server-manifest';
import { type PrerenderManifest } from './static-cache';
export interface StaticGeneratorOptions {
    /** Project root */
    cwd: string;
    /** .vista directory root */
    vistaDirRoot: string;
    /** Server manifest with route info */
    manifest: ServerManifest;
    /** Whether in dev mode (limits prerendering) */
    isDev: boolean;
    /** Build ID for cache busting */
    buildId: string;
}
export interface StaticGeneratorResult {
    /** Number of pages pre-rendered */
    pagesGenerated: number;
    /** URL paths that were pre-rendered */
    generatedPaths: string[];
    /** Paths that failed */
    failedPaths: Array<{
        path: string;
        error: string;
    }>;
    /** The prerender manifest */
    manifest: PrerenderManifest;
}
/** Embed Flight on SSG HTML so the client can hydrate without a live /rsc server. */
export declare function injectInlineFlightBootstrap(html: string, flightText: string): string;
/**
 * Run static generation for all eligible routes.
 */
export declare function generateStaticPages(options: StaticGeneratorOptions): Promise<StaticGeneratorResult>;
/**
 * Trigger ISR revalidation for a specific path.
 * Called at runtime when a stale page is requested.
 */
export declare function revalidatePath(urlPath: string, route: RouteEntry, params: Record<string, string | string[]> | undefined, cwd: string, vistaDirRoot: string): Promise<boolean>;
