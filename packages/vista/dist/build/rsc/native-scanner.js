"use strict";
/**
 * Vista RSC Native Scanner
 *
 * Uses Rust-powered native bindings for blazing fast component scanning.
 * Falls back to TypeScript implementation if native module unavailable.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNativeAvailable = isNativeAvailable;
exports.scanAppNative = scanAppNative;
exports.generateClientManifestNative = generateClientManifestNative;
exports.generateClientManifestForProjectNative = generateClientManifestForProjectNative;
exports.discoverProjectClientRootsNative = discoverProjectClientRootsNative;
exports.generateServerManifestNative = generateServerManifestNative;
exports.generateMountIdNative = generateMountIdNative;
exports.resetMountCounterNative = resetMountCounterNative;
exports.convertScanResult = convertScanResult;
const path_1 = __importDefault(require("path"));
let nativeModule = null;
let nativeLoadError = null;
/**
 * Try to load the native Rust module
 */
function loadNativeModule() {
    if (nativeModule !== null)
        return nativeModule;
    if (nativeLoadError !== null)
        return null;
    // Try multiple paths since we might be running from src or dist
    const possiblePaths = [
        // From compiled dist/build/rsc/native-scanner.js
        path_1.default.resolve(__dirname, '../../../../../crates/vista-napi'),
        // From source src/build/rsc/native-scanner.ts
        path_1.default.resolve(__dirname, '../../../../crates/vista-napi'),
        // From workspace root
        path_1.default.resolve(process.cwd(), '../crates/vista-napi'),
        // Try @aspect-build/vista-napi as npm package
        '@aspect-build/vista-napi',
    ];
    const _debug = !!process.env.VISTA_DEBUG;
    for (const modulePath of possiblePaths) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            nativeModule = require(modulePath);
            if (_debug)
                console.log('[Vista JS RSC] Using Rust-powered scanner');
            return nativeModule;
        }
        catch {
            // Continue trying other paths
        }
    }
    nativeLoadError = new Error('Native module not found');
    if (_debug)
        console.warn('⚠ Native module unavailable, using TypeScript fallback');
    return null;
}
/**
 * Check if native module is available
 */
function isNativeAvailable() {
    return loadNativeModule() !== null;
}
/**
 * Scan app directory using Rust native code
 * Returns null if native module is not available
 */
function scanAppNative(appDir) {
    const native = loadNativeModule();
    if (!native)
        return null;
    try {
        const startTime = performance.now();
        const result = native.rscScanApp(appDir);
        const scanTime = performance.now() - startTime;
        if (process.env.VISTA_DEBUG) {
            console.log(`🦀 Native scan completed in ${scanTime.toFixed(2)}ms (${result.totalFiles} files)`);
        }
        return result;
    }
    catch (e) {
        console.error('Native scan failed:', e);
        return null;
    }
}
/**
 * Generate client manifest using Rust native code
 */
function generateClientManifestNative(appDir, buildId) {
    const native = loadNativeModule();
    if (!native)
        return null;
    try {
        return native.rscGenerateClientManifest(appDir, buildId);
    }
    catch (e) {
        console.error('Native client manifest generation failed:', e);
        return null;
    }
}
/**
 * Generate client manifest from an explicit project root plus `app/`
 */
function generateClientManifestForProjectNative(cwd, appDir, buildId) {
    const native = loadNativeModule();
    if (!native || typeof native.rscGenerateClientManifestForProject !== 'function') {
        return null;
    }
    try {
        return native.rscGenerateClientManifestForProject(cwd, appDir, buildId);
    }
    catch (e) {
        console.error('Native project client manifest generation failed:', e);
        return null;
    }
}
/**
 * Discover project-level client scan roots using Rust native code
 */
function discoverProjectClientRootsNative(cwd) {
    const native = loadNativeModule();
    if (!native?.rscDiscoverProjectClientRoots)
        return null;
    try {
        return native.rscDiscoverProjectClientRoots(cwd);
    }
    catch (e) {
        console.error('Native client-root discovery failed:', e);
        return null;
    }
}
/**
 * Generate server manifest using Rust native code
 */
function generateServerManifestNative(appDir, buildId) {
    const native = loadNativeModule();
    if (!native)
        return null;
    try {
        return native.rscGenerateServerManifest(appDir, buildId);
    }
    catch (e) {
        console.error('Native server manifest generation failed:', e);
        return null;
    }
}
/**
 * Generate unique mount ID for client component
 */
function generateMountIdNative() {
    const native = loadNativeModule();
    if (!native)
        return null;
    return native.rscGenerateMountId();
}
/**
 * Reset mount ID counter (call at start of each request)
 */
function resetMountCounterNative() {
    const native = loadNativeModule();
    if (!native)
        return false;
    native.rscResetMountCounter();
    return true;
}
/**
 * Convert NAPI scan result to internal format
 */
function convertScanResult(result) {
    return {
        clientComponents: result.clientComponents.map((c) => ({
            absolutePath: c.absolutePath,
            relativePath: c.relativePath,
            isClient: c.isClient,
            directiveLine: c.directiveLine,
            componentType: c.componentType,
            exports: c.exports,
            clientHooksUsed: c.clientHooksUsed,
            hasMetadata: c.hasMetadata,
            hasGenerateMetadata: c.hasGenerateMetadata,
        })),
        serverComponents: result.serverComponents.map((c) => ({
            absolutePath: c.absolutePath,
            relativePath: c.relativePath,
            isClient: false,
            directiveLine: 0,
            componentType: c.componentType,
            exports: c.exports,
            clientHooksUsed: [],
            hasMetadata: c.hasMetadata,
            hasGenerateMetadata: c.hasGenerateMetadata,
        })),
        pages: result.pages,
        layouts: result.layouts,
        apiRoutes: result.apiRoutes,
        errors: result.errors,
        totalFiles: result.totalFiles,
        scanTimeMs: result.scanTimeMs,
    };
}
