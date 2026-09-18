/**
 * Vista RSC Native Scanner
 *
 * Uses Rust-powered native bindings for blazing fast component scanning.
 * Falls back to TypeScript implementation if native module unavailable.
 */
export interface NapiScannedComponent {
    absolutePath: string;
    relativePath: string;
    isClient: boolean;
    directiveLine: number;
    componentType: string;
    exports: string[];
    clientHooksUsed: string[];
    hasMetadata: boolean;
    hasGenerateMetadata: boolean;
}
export interface NapiServerComponentError {
    file: string;
    message: string;
    hooks: string[];
}
export interface NapiScanResult {
    clientComponents: NapiScannedComponent[];
    serverComponents: NapiScannedComponent[];
    pages: NapiScannedComponent[];
    layouts: NapiScannedComponent[];
    apiRoutes: NapiScannedComponent[];
    errors: NapiServerComponentError[];
    totalFiles: number;
    scanTimeMs: number;
}
export interface NapiClientModuleEntry {
    id: string;
    path: string;
    absolutePath: string;
    chunkName: string;
    exports: string[];
    asyncLoad: boolean;
}
export interface NapiClientManifest {
    buildId: string;
    clientModules: NapiClientModuleEntry[];
}
export interface NapiRouteEntry {
    pattern: string;
    pagePath: string;
    layoutPaths: string[];
    loadingPath: string | null;
    errorPath: string | null;
    routeType: string;
}
export interface NapiServerModuleEntry {
    id: string;
    path: string;
    absolutePath: string;
    componentType: string;
    hasMetadata: boolean;
    hasGenerateMetadata: boolean;
}
export interface NapiServerManifest {
    buildId: string;
    serverModules: NapiServerModuleEntry[];
    routes: NapiRouteEntry[];
}
export interface NapiClientScanRoot {
    dir: string;
    prefix: string;
}
/**
 * Check if native module is available
 */
export declare function isNativeAvailable(): boolean;
/**
 * Scan app directory using Rust native code
 * Returns null if native module is not available
 */
export declare function scanAppNative(appDir: string): NapiScanResult | null;
/**
 * Generate client manifest using Rust native code
 */
export declare function generateClientManifestNative(appDir: string, buildId: string): NapiClientManifest | null;
/**
 * Generate client manifest from an explicit project root plus `app/`
 */
export declare function generateClientManifestForProjectNative(cwd: string, appDir: string, buildId: string): NapiClientManifest | null;
/**
 * Discover project-level client scan roots using Rust native code
 */
export declare function discoverProjectClientRootsNative(cwd: string): NapiClientScanRoot[] | null;
/**
 * Generate server manifest using Rust native code
 */
export declare function generateServerManifestNative(appDir: string, buildId: string): NapiServerManifest | null;
/**
 * Generate unique mount ID for client component
 */
export declare function generateMountIdNative(): string | null;
/**
 * Reset mount ID counter (call at start of each request)
 */
export declare function resetMountCounterNative(): boolean;
/**
 * Convert NAPI scan result to internal format
 */
export declare function convertScanResult(result: NapiScanResult): {
    clientComponents: {
        absolutePath: string;
        relativePath: string;
        isClient: boolean;
        directiveLine: number;
        componentType: string;
        exports: string[];
        clientHooksUsed: string[];
        hasMetadata: boolean;
        hasGenerateMetadata: boolean;
    }[];
    serverComponents: {
        absolutePath: string;
        relativePath: string;
        isClient: boolean;
        directiveLine: number;
        componentType: string;
        exports: string[];
        clientHooksUsed: any[];
        hasMetadata: boolean;
        hasGenerateMetadata: boolean;
    }[];
    pages: NapiScannedComponent[];
    layouts: NapiScannedComponent[];
    apiRoutes: NapiScannedComponent[];
    errors: NapiServerComponentError[];
    totalFiles: number;
    scanTimeMs: number;
};
