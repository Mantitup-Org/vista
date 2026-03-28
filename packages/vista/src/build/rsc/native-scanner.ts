/**
 * Vista RSC Native Scanner
 *
 * Uses Rust-powered native bindings for blazing fast component scanning.
 * Falls back to TypeScript implementation if native module unavailable.
 */

import path from 'path';

// Types from Rust NAPI bindings
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

// Native module interface
interface VistaNative {
  rscScanApp(appDir: string): NapiScanResult;
  rscGenerateClientManifest(appDir: string, buildId: string): NapiClientManifest;
  rscGenerateServerManifest(appDir: string, buildId: string): NapiServerManifest;
  rscGenerateMountId(): string;
  rscResetMountCounter(): void;
}

let nativeModule: VistaNative | null = null;
let nativeLoadError: Error | null = null;

/**
 * Try to load the native Rust module
 */
function loadNativeModule(): VistaNative | null {
  if (nativeModule !== null) return nativeModule;
  if (nativeLoadError !== null) return null;

  // Try multiple paths since we might be running from src or dist
  const possiblePaths = [
    // From compiled dist/build/rsc/native-scanner.js
    path.resolve(__dirname, '../../../../../crates/vista-napi'),
    // From source src/build/rsc/native-scanner.ts
    path.resolve(__dirname, '../../../../crates/vista-napi'),
    // From workspace root
    path.resolve(process.cwd(), '../crates/vista-napi'),
    // Try @aspect-build/vista-napi as npm package
    '@aspect-build/vista-napi',
  ];

  const _debug = !!process.env.VISTA_DEBUG;
  for (const modulePath of possiblePaths) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      nativeModule = require(modulePath);
      if (_debug) console.log('[Vista JS RSC] Using Rust-powered scanner');
      return nativeModule;
    } catch {
      // Continue trying other paths
    }
  }

  nativeLoadError = new Error('Native module not found');
  if (_debug) console.warn('⚠ Native module unavailable, using TypeScript fallback');
  return null;
}

/**
 * Check if native module is available
 */
export function isNativeAvailable(): boolean {
  return loadNativeModule() !== null;
}

/**
 * Scan app directory using Rust native code
 * Returns null if native module is not available
 */
export function scanAppNative(appDir: string): NapiScanResult | null {
  const native = loadNativeModule();
  if (!native) return null;

  try {
    const startTime = performance.now();
    const result = native.rscScanApp(appDir);
    const scanTime = performance.now() - startTime;

    if (process.env.VISTA_DEBUG) {
      console.log(
        `🦀 Native scan completed in ${scanTime.toFixed(2)}ms (${result.totalFiles} files)`
      );
    }
    return result;
  } catch (e) {
    console.error('Native scan failed:', e);
    return null;
  }
}

/**
 * Generate client manifest using Rust native code
 */
export function generateClientManifestNative(
  appDir: string,
  buildId: string
): NapiClientManifest | null {
  const native = loadNativeModule();
  if (!native) return null;

  try {
    return native.rscGenerateClientManifest(appDir, buildId);
  } catch (e) {
    console.error('Native client manifest generation failed:', e);
    return null;
  }
}

/**
 * Generate server manifest using Rust native code
 */
export function generateServerManifestNative(
  appDir: string,
  buildId: string
): NapiServerManifest | null {
  const native = loadNativeModule();
  if (!native) return null;

  try {
    return native.rscGenerateServerManifest(appDir, buildId);
  } catch (e) {
    console.error('Native server manifest generation failed:', e);
    return null;
  }
}

/**
 * Generate unique mount ID for client component
 */
export function generateMountIdNative(): string | null {
  const native = loadNativeModule();
  if (!native) return null;
  return native.rscGenerateMountId();
}

/**
 * Reset mount ID counter (call at start of each request)
 */
export function resetMountCounterNative(): boolean {
  const native = loadNativeModule();
  if (!native) return false;
  native.rscResetMountCounter();
  return true;
}

/**
 * Convert NAPI scan result to internal format
 */
export function convertScanResult(result: NapiScanResult) {
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
