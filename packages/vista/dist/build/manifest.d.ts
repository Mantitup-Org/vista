/**
 * Vista Build Utilities
 *
 * Generates build manifests, BUILD_ID, and manages .vista output structure.
 */
import type { VistaEngineVariant } from '../config';
import type { ImageConfig } from '../image/image-config';
/**
 * Generate a unique build ID based on timestamp and random bytes.
 */
export declare function generateBuildId(): string;
/**
 * Read existing BUILD_ID or generate a new one.
 */
export declare function getBuildId(vistaDir: string, forceNew?: boolean): string;
export interface VistaDirs {
    root: string;
    cache: string;
    imageCache: string;
    server: string;
    static: string;
    chunks: string;
    css: string;
    media: string;
}
/**
 * Create the .vista directory structure.
 * In legacy mode, only creates root (no empty server/static dirs).
 * In RSC mode, creates the full structure for server/client bundles.
 */
export declare function createVistaDirectories(cwd: string, mode?: 'legacy' | 'rsc'): VistaDirs;
export interface BuildManifest {
    buildId: string;
    polyfillFiles: string[];
    devFiles: string[];
    lowPriorityFiles: string[];
    rootMainFiles: string[];
    pages: Record<string, string[]>;
}
export interface ArtifactManifest {
    schemaVersion: number;
    buildId: string;
    generatedAt: string;
    /** Integrity watermark — framework identity + hash token */
    __integrity?: string;
    manifests: {
        buildManifest: string;
        routesManifest: string;
        appPathRoutesManifest: string;
        prerenderManifest: string;
        requiredServerFiles: string;
        reactClientManifest: string;
        reactServerManifest: string;
        serverManifest?: string;
        runtimeManifest?: string;
        fileTrace?: string;
        standaloneServer?: string;
    };
}
/**
 * Generate build-manifest.json
 */
export declare function generateBuildManifest(vistaDir: string, buildId: string, pages?: Record<string, string[]>): BuildManifest;
interface RouteLike {
    pattern: string;
    pagePath: string;
    type?: 'static' | 'dynamic' | 'catch-all';
}
export interface RouteHandlerLike {
    pattern: string;
    filePath: string;
    type?: 'static' | 'dynamic' | 'catch-all';
    methods?: string[];
    runtime?: string;
}
export declare function generateAppPathRoutesManifest(vistaDir: string, routes?: RouteLike[], routeHandlers?: RouteHandlerLike[]): Record<string, string>;
export declare function generatePrerenderManifest(vistaDir: string): void;
export declare function generateRequiredServerFilesManifest(cwd: string, vistaDir: string, extraFiles?: string[], appDir?: string): void;
export declare function ensureJsonFile(vistaDir: string, relativePath: string, fallback?: unknown): void;
export declare function writeArtifactManifest(vistaDir: string, buildId: string, extraManifestEntries?: Partial<ArtifactManifest['manifests']>): ArtifactManifest;
export declare function writeCanonicalVistaArtifacts(cwd: string, vistaDir: string, buildId: string, routes?: RouteLike[], routeHandlers?: RouteHandlerLike[]): ArtifactManifest;
interface WriteReservedVistaArtifactsOptions {
    buildId: string;
    engineVariant?: VistaEngineVariant;
    imagesConfig?: Partial<ImageConfig> | undefined;
}
export declare function writeReservedVistaArtifacts(vistaDir: string, options: WriteReservedVistaArtifactsOptions): void;
export interface RouteInfo {
    page: string;
    regex: string;
    routeKeys: Record<string, string>;
    namedRegex?: string;
}
/** A file-based API route handler (`app/**\/route.*`) as recorded in the manifest. */
export interface RouteHandlerInfo {
    page: string;
    regex: string;
    namedRegex: string;
    routeKeys: Record<string, string>;
    methods: string[];
    runtime?: string;
}
export interface RoutesManifest {
    version: number;
    basePath: string;
    redirects: any[];
    rewrites: any[];
    headers: any[];
    staticRoutes: RouteInfo[];
    dynamicRoutes: RouteInfo[];
    /**
     * File-based API route handlers, kept in their own list so consumers that expect
     * `staticRoutes`/`dynamicRoutes` to be page routes keep working unchanged.
     */
    routeHandlers: RouteHandlerInfo[];
}
/**
 * Generate routes-manifest.json from route tree.
 */
export declare function generateRoutesManifest(vistaDir: string, staticRoutes?: RouteInfo[], dynamicRoutes?: RouteInfo[], routeHandlers?: RouteHandlerLike[]): RoutesManifest;
export interface ClientComponentInfo {
    filePath: string;
    chunkName: string;
    exports: string[];
}
export interface ClientComponentsManifest {
    buildId: string;
    clientModules: Record<string, ClientComponentInfo>;
}
/**
 * Generate manifest of client components (files with 'use client').
 */
export declare function generateClientComponentsManifest(vistaDir: string, buildId: string, clientModules?: Record<string, ClientComponentInfo>): ClientComponentsManifest;
export interface ServerComponentInfo {
    filePath: string;
    hasMetadata: boolean;
    hasGenerateMetadata: boolean;
}
/**
 * Generate manifest of server components.
 */
export declare function generateServerComponentsManifest(vistaDir: string, serverModules?: Record<string, ServerComponentInfo>): void;
/**
 * Get Webpack cache configuration for persistent caching.
 */
export declare function getWebpackCacheConfig(vistaDir: string, buildId: string, name: string, engineVariant?: VistaEngineVariant, cwd?: string): {
    type: "filesystem";
    version: string;
    cacheDirectory: string;
    name: string;
    buildDependencies: {
        config: string[];
    };
};
/**
 * Clean old cache entries (keeps last N builds).
 */
export declare function cleanOldCache(vistaDir: string, keepBuilds?: number): void;
export declare function pruneEmptyVistaDirectories(vistaDir: string): void;
export {};
