/**
 * Server Component Manifest Generator
 *
 * Scans the app directory and builds a manifest of all Server Components.
 * Server components are all components WITHOUT 'use client' directive.
 *
 * Server components:
 * - Render on the server only
 * - Have access to server resources (DB, file system, env vars)
 * - Contribute 0kb to the client JavaScript bundle
 */
import { type RouteHandlerMethod } from '../../server/route-handler-registry';
import { type ResolvedSegmentConfig, type SegmentConfig } from '../../server/segment-config';
export interface ServerComponentEntry {
    /** Unique ID for this component */
    id: string;
    /** Relative path from app directory */
    path: string;
    /** Absolute file path */
    absolutePath: string;
    /** Component type: page, layout, loading, error, default, component */
    type: 'page' | 'layout' | 'loading' | 'error' | 'not-found' | 'default' | 'component';
    /** Has static metadata export */
    hasMetadata: boolean;
    /** Has generateMetadata function */
    hasGenerateMetadata: boolean;
    /** Has generateStaticParams function */
    hasGenerateStaticParams: boolean;
    /** Rendering mode: 'static' | 'dynamic' | 'auto' (from export const dynamic) */
    renderMode: 'static' | 'dynamic' | 'auto';
    /** ISR revalidate interval in seconds (from export const revalidate) */
    revalidate?: number;
    /** Segment config exports parsed from the module */
    segmentConfig: SegmentConfig;
    /** List of client components this server component imports */
    clientDependencies: string[];
}
export interface ServerManifest {
    /** Build ID */
    buildId: string;
    /** Map of module ID to server component info */
    serverModules: Record<string, ServerComponentEntry>;
    /** Map of path to module ID */
    pathToId: Record<string, string>;
    /** Routes discovered */
    routes: RouteEntry[];
    /** Discovered server actions keyed by action id */
    serverActions: Record<string, ServerActionEntry>;
    /** Discovered file-based API route handlers (`app/**\/route.*`) */
    routeHandlers: RouteHandlerEntry[];
}
export interface RouteHandlerEntry {
    /** URL pattern, e.g. `/api/users/:id` */
    pattern: string;
    /** Absolute path of the route file */
    filePath: string;
    /** Raw filesystem segments from `app/` to the route directory */
    sourceSegments: string[];
    /** Route shape, using the same vocabulary as page routes */
    type: 'static' | 'dynamic' | 'catch-all';
    /** HTTP methods the route file exports */
    methods: RouteHandlerMethod[];
    /** Runtime requested via `export const runtime`, when present */
    runtime?: string;
}
export interface ServerActionEntry {
    /** Stable action id used by the runtime */
    id: string;
    /** Absolute file path containing the action */
    filePath: string;
    /** Whether the action came from a module directive or inline directive */
    kind: 'module-export' | 'inline';
    /** Export or inline symbol name */
    exportName: string;
}
export interface RouteEntry {
    /** URL path pattern */
    pattern: string;
    /** Page component path */
    pagePath: string;
    /** Absolute directory that contains the page component */
    routeDir: string;
    /** Raw filesystem segments from app/ to the page directory */
    sourceSegments: string[];
    /** Layout component paths (from root to this route) */
    layoutPaths: string[];
    /** Loading component path if exists */
    loadingPath?: string;
    /** Error component path if exists */
    errorPath?: string;
    /** Route type (URL pattern shape) */
    type: 'static' | 'dynamic' | 'catch-all';
    /** Rendering mode: derived from page exports */
    renderMode: 'static' | 'dynamic' | 'isr';
    /** ISR revalidate interval in seconds */
    revalidate?: number;
    /** Whether page exports generateStaticParams */
    hasGenerateStaticParams: boolean;
    /** Merged segment config from ancestor layouts + page */
    segmentConfig: ResolvedSegmentConfig;
}
/**
 * Generate the server component manifest
 */
export declare function generateServerManifest(cwd: string, appDir: string): ServerManifest;
/**
 * Get server component by path
 */
export declare function getServerComponent(manifest: ServerManifest, filePath: string): ServerComponentEntry | undefined;
/**
 * Check if a path is a server component
 */
export declare function isServerComponentPath(manifest: ServerManifest, filePath: string): boolean;
