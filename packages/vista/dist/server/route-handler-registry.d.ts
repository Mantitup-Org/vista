/**
 * Discovery and resolution of file-based API route handlers (`app/**\/route.{ts,tsx,js,jsx}`).
 *
 * One scan implementation serves both sides of the framework:
 *   - the build scanner (build/rsc/server-manifest.ts) records what exists, so route
 *     handlers land in the emitted manifests alongside pages
 *   - the request path (server/typed-api-runtime.ts) resolves a URL to a handler file
 *     plus its dynamic params
 *
 * Keeping them on the same function is what stops the build manifest and the runtime
 * from disagreeing about which files are routes.
 */
import { type ParsedRoute, type RouteParams, type RouteSegmentType } from './route-patterns';
/** Supported HTTP methods for a route handler, in canonical order. */
export declare const ROUTE_HANDLER_METHODS: readonly ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
export type RouteHandlerMethod = (typeof ROUTE_HANDLER_METHODS)[number];
export interface DiscoveredRouteHandler {
    /** URL pattern, e.g. `/api/users/:id`. */
    pattern: string;
    /** Absolute path of the route file. */
    filePath: string;
    /** Filesystem segments from `app/` to the route file's directory. */
    sourceSegments: string[];
    /** Route shape, using the same vocabulary as page routes. */
    type: RouteSegmentType;
    /** HTTP methods the file appears to export. */
    methods: RouteHandlerMethod[];
    /** Runtime requested via `export const runtime`, when present. */
    runtime?: string;
    /** Parsed segments, retained so the resolver does not re-parse per request. */
    parsed: ParsedRoute;
}
export interface ResolvedRouteHandler {
    filePath: string;
    pattern: string;
    params: RouteParams;
}
/**
 * Scan an app directory for route handler files.
 *
 * Results are ordered most-specific first, so the first match during resolution is
 * the correct one.
 */
export declare function discoverRouteHandlers(appDir: string): DiscoveredRouteHandler[];
/**
 * Cached variant of {@link discoverRouteHandlers}.
 *
 * Production builds scan once. Dev re-scans at most every {@link DEV_SCAN_TTL_MS},
 * which keeps newly added route files visible without turning every request into a
 * full directory walk.
 */
export declare function getRouteHandlers(appDir: string, options?: {
    isDev?: boolean;
}): DiscoveredRouteHandler[];
/** Drop cached discovery results. Exported for tests and for watch-mode invalidation. */
export declare function clearRouteHandlerCache(appDir?: string): void;
/**
 * Resolve a request path to a route handler file and its dynamic params.
 *
 * Returns null when no route file matches, leaving the caller free to fall through to
 * pages, the typed API, or a 404.
 */
export declare function resolveRouteHandler(appDir: string, requestPath: string, options?: {
    isDev?: boolean;
}): ResolvedRouteHandler | null;
