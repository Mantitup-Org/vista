/**
 * Vista File Scanner
 *
 * Scans the app directory and categorizes files as client or server components
 * using Rust NAPI bindings for fast detection.
 *
 * Server Component Rules:
 * - By default, all components are Server Components
 * - Using 'use client' directive makes it a Client Component
 * - Using client hooks (useState, useEffect, etc.) without 'use client' is an ERROR
 *
 * Performance: Uses Rust-powered RSC scanner when available (~10-100x faster)
 */
export interface RouteNode {
    segment: string;
    kind: 'static' | 'dynamic' | 'catch-all' | 'optional-catch-all' | 'group' | 'parallel' | 'interception';
    indexPath?: string;
    layoutPath?: string;
    loadingPath?: string;
    errorPath?: string;
    notFoundPath?: string;
    children: RouteNode[];
}
export declare function getRouteTree(appDir: string): RouteNode;
export interface ClientDirectiveInfo {
    is_client: boolean;
    directive_line: number;
}
export interface ScannedFile {
    absolutePath: string;
    relativePath: string;
    isClient: boolean;
    directiveLine: number;
    exports: string[];
    clientHooksUsed: string[];
    hasError: boolean;
    errorMessage?: string;
}
export interface ScanResult {
    clientComponents: ScannedFile[];
    serverComponents: ScannedFile[];
    layouts: ScannedFile[];
    pages: ScannedFile[];
    notFound?: ScannedFile;
    error?: ScannedFile;
    loading?: ScannedFile;
    errors: ScanError[];
}
export interface ScanError {
    file: string;
    message: string;
    hooks: string[];
}
/**
 * Scan the app directory and return categorized files
 * Uses Rust-powered RSC scanner when available for ~10-100x faster performance
 */
export declare function scanAppDirectory(appDir: string): ScanResult;
/**
 * Check if Rust native bindings are available
 */
export declare function isNativeAvailable(): boolean;
/**
 * Get version info
 */
export declare function getVersion(): string;
