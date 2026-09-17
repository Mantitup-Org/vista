/**
 * Route pattern parsing and matching for file-based API route handlers.
 *
 * Shared by the build-time scanner (packages/vista/src/build/rsc/server-manifest.ts)
 * and the request-time resolver (packages/vista/src/server/typed-api-runtime.ts) so
 * both sides agree on what `app/api/users/[id]/route.ts` means.
 *
 * Patterns use the same `:name` / `:name*` shape the page router already emits, so
 * `toRegexFromPattern()` in build/manifest.ts consumes them unchanged.
 *
 * This module is intentionally filesystem-free and framework-free: it is pure string
 * work, which keeps it cheap to call per request and straightforward to test.
 */
/** A single parsed path segment of a route. */
export type RouteSegment = {
    kind: 'static';
    value: string;
} | {
    kind: 'dynamic';
    paramName: string;
} | {
    kind: 'catch-all';
    paramName: string;
    optional: boolean;
};
export type RouteSegmentType = 'static' | 'dynamic' | 'catch-all';
export interface ParsedRoute {
    /** URL pattern, e.g. `/api/users/:id` or `/api/files/:path*`. */
    pattern: string;
    /** Parsed segments in order, route groups already removed. */
    segments: RouteSegment[];
    /** Coarse route shape, matching the vocabulary the page router uses. */
    type: RouteSegmentType;
}
export type RouteParams = Record<string, string | string[]>;
/** `(marketing)` - grouping only, contributes nothing to the URL. */
export declare function isRouteGroupSegment(segment: string): boolean;
/** `@modal` - parallel route slot. Not addressable as an API route. */
export declare function isParallelRouteSegment(segment: string): boolean;
/** `(.)photo`, `(..)feed`, `(...)root` - interception routes. Not addressable either. */
export declare function isInterceptionRouteSegment(segment: string): boolean;
/**
 * Turn filesystem segments (relative to `app/`) into a parsed route.
 *
 * Returns null when the path is not addressable as a URL - a parallel slot or an
 * interception route. Route groups are dropped from the pattern but do not
 * disqualify the route.
 */
export declare function parseRouteSegments(sourceSegments: string[]): ParsedRoute | null;
/** Split a request pathname into segments, ignoring query string and trailing slash. */
export declare function splitRequestPath(requestPath: string): string[];
/**
 * Match a parsed route against request path segments.
 *
 * Returns the extracted params, or null when the route does not match. A catch-all
 * param is returned as a string array, mirroring the App Router's shape.
 */
export declare function matchRouteSegments(route: ParsedRoute, requestSegments: string[]): RouteParams | null;
/**
 * Ordering for route resolution: the most specific route wins.
 *
 * Static beats dynamic beats catch-all, compared segment by segment, so
 * `/api/users/me` is preferred over `/api/users/[id]`, which is preferred over
 * `/api/users/[...rest]`. Ties fall back to the pattern string for stable,
 * platform-independent ordering.
 */
export declare function compareRouteSpecificity(a: ParsedRoute, b: ParsedRoute): number;
