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

import * as fs from 'fs';
import * as path from 'path';
import {
  isNativeAvailable as isRscNativeAvailable,
  scanAppNative,
  convertScanResult,
} from '../build/rsc/native-scanner';

const RESERVED_INTERNAL_SEGMENTS = new Set(['[not-found]']);

function hasReservedInternalSegment(relativePath: string): boolean {
  return relativePath
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => RESERVED_INTERNAL_SEGMENTS.has(segment));
}

// Try to load Rust NAPI bindings, fallback to JS if not available
const _debug = !!process.env.VISTA_DEBUG;
let rustNative: any = null;
try {
  // Try multiple paths since we might be running from src or dist
  const possiblePaths = [
    // From compiled dist/bin/file-scanner.js
    require('path').resolve(__dirname, '../../../../crates/vista-napi'),
    // From source src/bin/file-scanner.ts
    require('path').resolve(__dirname, '../../../crates/vista-napi'),
    // From workspace root
    require('path').resolve(process.cwd(), '../crates/vista-napi'),
  ];

  for (const p of possiblePaths) {
    try {
      rustNative = require(p);
      if (_debug) console.log(`[Vista JS] Loaded Rust native bindings from ${p}`);
      break;
    } catch (e) {
      // Try next path
    }
  }

  if (!rustNative && _debug) {
    console.log('[Vista JS] Rust native bindings not found, using JS fallback');
  }
} catch (e) {
  if (_debug) console.log('[Vista JS] Rust native bindings not found, using JS fallback');
}

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

function isReservedRouteNode(node: RouteNode): boolean {
  return node.kind === 'dynamic' && node.segment === 'not-found';
}

function pruneReservedRouteNodes(node: RouteNode): RouteNode {
  return {
    ...node,
    children: node.children
      .filter((child) => !isReservedRouteNode(child))
      .map((child) => pruneReservedRouteNodes(child)),
  };
}

export function getRouteTree(appDir: string): RouteNode {
  if (rustNative && rustNative.getRouteTree) {
    const nativeTree = rustNative.getRouteTree(appDir);
    return pruneReservedRouteNodes(nativeTree);
  }
  // JS Fallback - build route tree from file system
  return buildRouteTreeJS(appDir, appDir);
}

function classifySegment(segment: string): RouteNode['kind'] {
  if (segment.startsWith('[[...') && segment.endsWith(']]')) return 'optional-catch-all';
  if (segment.startsWith('[...')) return 'catch-all';
  if (
    segment.startsWith('(.)') ||
    segment.startsWith('(..)') ||
    segment.startsWith('(..)(..)') ||
    segment.startsWith('(...)')
  ) {
    return 'interception';
  }
  if (segment.startsWith('(') && segment.endsWith(')')) return 'group';
  if (segment.startsWith('@')) return 'parallel';
  if (segment.startsWith('[')) return 'dynamic';
  return 'static';
}

/**
 * JS Fallback for building route tree when Rust bindings are unavailable
 */
function buildRouteTreeJS(dir: string, appDir: string): RouteNode {
  const segment = dir === appDir ? '' : path.basename(dir);
  const kind = classifySegment(segment);
  const node: RouteNode = {
    segment: kind === 'group' ? '' : segment,
    kind,
    children: [],
  };

  if (!fs.existsSync(dir)) {
    return node;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules' &&
        !RESERVED_INTERNAL_SEGMENTS.has(entry.name)
      ) {
        node.children.push(buildRouteTreeJS(fullPath, appDir));
      }
    } else if (entry.isFile()) {
      const basename = path.basename(entry.name, path.extname(entry.name));
      const relativePath = path.relative(appDir, fullPath);

      if (basename === 'index' || basename === 'page') {
        node.indexPath = relativePath;
      } else if (basename === 'root') {
        node.layoutPath = relativePath;
      } else if (basename === 'layout') {
        // Prefer root.* when both root.* and layout.* exist in same segment.
        if (!node.layoutPath) {
          node.layoutPath = relativePath;
        }
      } else if (basename === 'loading') {
        node.loadingPath = relativePath;
      } else if (basename === 'error') {
        node.errorPath = relativePath;
      } else if (basename === 'not-found') {
        node.notFoundPath = relativePath;
      }
    }
  }

  return node;
}

export interface ClientDirectiveInfo {
  is_client: boolean;
  directive_line: number;
}

// Client-only hooks and APIs that require 'use client' directive
const CLIENT_HOOKS = [
  'useState',
  'useEffect',
  'useLayoutEffect',
  'useReducer',
  'useRef',
  'useImperativeHandle',
  'useCallback',
  'useMemo',
  'useContext',
  'useDebugValue',
  'useDeferredValue',
  'useTransition',
  'useId',
  'useSyncExternalStore',
  'useInsertionEffect',
];

const CLIENT_APIS = [
  'createContext',
  'forwardRef',
  'memo',
  'lazy',
  'startTransition',
  'useFormStatus',
  'useFormState',
  'useOptimistic',
];

const BROWSER_APIS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
  'history',
  'addEventListener',
  'removeEventListener',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'fetch', // Can be server but often client
];

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
 * Fast check using Rust if available, else JS fallback
 */
function isClientComponent(source: string): boolean {
  const trimmed = source.trimStart();
  if (trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"')) {
    return true;
  }

  if (rustNative?.isClientComponent) {
    return rustNative.isClientComponent(source);
  }

  return false;
}

/**
 * Analyze directive with line number
 */
function analyzeClientDirective(source: string): { isClient: boolean; directiveLine: number } {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    if (line.startsWith("'use client'") || line.startsWith('"use client"')) {
      return { isClient: true, directiveLine: i + 1 };
    }
    break;
  }

  if (rustNative?.analyzeClientDirective) {
    return rustNative.analyzeClientDirective(source);
  }

  return { isClient: false, directiveLine: 0 };
}

/**
 * Detect client-only hooks/APIs used in source
 */
function detectClientHooks(source: string): string[] {
  const usedHooks: string[] = [];

  // Check for React hooks
  for (const hook of CLIENT_HOOKS) {
    // Match hook usage: useState, useState(, useState<
    const regex = new RegExp(`\\b${hook}\\s*[(<]`, 'g');
    if (regex.test(source)) {
      usedHooks.push(hook);
    }
  }

  // Check for client APIs
  for (const api of CLIENT_APIS) {
    const regex = new RegExp(`\\b${api}\\s*[(<]`, 'g');
    if (regex.test(source)) {
      usedHooks.push(api);
    }
  }

  // Check for browser APIs (with more context to avoid false positives)
  for (const api of BROWSER_APIS) {
    // Look for direct usage like window.something or just window
    const regex = new RegExp(`\\b${api}\\s*[.\\[]`, 'g');
    if (regex.test(source)) {
      usedHooks.push(api);
    }
  }

  // Check for event handlers (onClick, onChange, etc.)
  const eventHandlerRegex = /\bon[A-Z][a-zA-Z]*\s*=/g;
  if (eventHandlerRegex.test(source)) {
    usedHooks.push('event handlers (onClick, onChange, etc.)');
  }

  return [...new Set(usedHooks)]; // Remove duplicates
}

/**
 * Extract exports from source (basic detection)
 */
function extractExports(source: string): string[] {
  const exports: string[] = [];
  const lines = source.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // export default function Name
    if (trimmed.startsWith('export default function ')) {
      const match = trimmed.match(/export default function (\w+)/);
      if (match) exports.push(match[1]);
    }
    // export function Name
    else if (trimmed.startsWith('export function ')) {
      const match = trimmed.match(/export function (\w+)/);
      if (match) exports.push(match[1]);
    }
    // export const Name
    else if (trimmed.startsWith('export const ')) {
      const match = trimmed.match(/export const (\w+)/);
      if (match) exports.push(match[1]);
    }
    // export default
    else if (trimmed.startsWith('export default')) {
      exports.push('default');
    }
  }

  return exports;
}

/**
 * Recursively scan directory for TypeScript/TSX files
 */
function scanDirectory(dir: string, baseDir: string, errors: ScanError[]): ScannedFile[] {
  const results: ScannedFile[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      results.push(...scanDirectory(fullPath, baseDir, errors));
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      const source = fs.readFileSync(fullPath, 'utf-8');
      const analysis = analyzeClientDirective(source);
      const exports = extractExports(source);
      const clientHooksUsed = detectClientHooks(source);

      let hasError = false;
      let errorMessage: string | undefined;

      // ERROR: Using client hooks without 'use client' directive
      if (!analysis.isClient && clientHooksUsed.length > 0) {
        hasError = true;
        const hookList = clientHooksUsed.slice(0, 3).join(', ');
        const more = clientHooksUsed.length > 3 ? ` and ${clientHooksUsed.length - 3} more` : '';
        errorMessage = `Server Component Error: You're using ${hookList}${more} in a Server Component.\n\nTo fix this, add 'use client' at the top of your file to make it a Client Component:\n\n'use client';\n\nimport ...`;

        errors.push({
          file: path.relative(baseDir, fullPath),
          message: errorMessage,
          hooks: clientHooksUsed,
        });
      }

      results.push({
        absolutePath: fullPath,
        relativePath: path.relative(baseDir, fullPath),
        isClient: analysis.isClient,
        directiveLine: analysis.directiveLine,
        exports,
        clientHooksUsed,
        hasError,
        errorMessage,
      });
    }
  }

  return results;
}

function hasUseClientDirectiveInApp(appDir: string): boolean {
  const queue: string[] = [appDir];

  while (queue.length > 0) {
    const currentDir = queue.pop() as string;
    if (!fs.existsSync(currentDir)) continue;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          queue.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile() || !/\.(tsx?|jsx?)$/.test(entry.name)) continue;

      try {
        const source = fs.readFileSync(fullPath, 'utf-8').trimStart();
        if (source.startsWith("'use client'") || source.startsWith('"use client"')) {
          return true;
        }
      } catch {
        // ignore file read failures and continue
      }
    }
  }

  return false;
}

/**
 * Scan the app directory and return categorized files
 * Uses Rust-powered RSC scanner when available for ~10-100x faster performance
 */
export function scanAppDirectory(appDir: string): ScanResult {
  // Try native RSC scanner first (Rust-powered, much faster)
  if (isRscNativeAvailable()) {
    const nativeResult = scanAppNative(appDir);
    if (nativeResult) {
      const converted = convertScanResult(nativeResult);

      // Transform to our ScanResult format
      const result: ScanResult = {
        clientComponents: converted.clientComponents.map((c) => ({
          absolutePath: c.absolutePath,
          relativePath: c.relativePath,
          isClient: c.isClient,
          directiveLine: c.directiveLine,
          exports: c.exports,
          clientHooksUsed: c.clientHooksUsed,
          hasError: false,
          errorMessage: undefined,
        })),
        serverComponents: converted.serverComponents.map((c) => ({
          absolutePath: c.absolutePath,
          relativePath: c.relativePath,
          isClient: false,
          directiveLine: 0,
          exports: c.exports,
          clientHooksUsed: [],
          hasError: false,
          errorMessage: undefined,
        })),
        layouts: nativeResult.layouts.map((c) => ({
          absolutePath: c.absolutePath,
          relativePath: c.relativePath,
          isClient: c.isClient,
          directiveLine: c.directiveLine,
          exports: c.exports,
          clientHooksUsed: c.clientHooksUsed,
          hasError: false,
          errorMessage: undefined,
        })),
        pages: nativeResult.pages
          .map((c) => ({
            absolutePath: c.absolutePath,
            relativePath: c.relativePath,
            isClient: c.isClient,
            directiveLine: c.directiveLine,
            exports: c.exports,
            clientHooksUsed: c.clientHooksUsed,
            hasError: false,
            errorMessage: undefined,
          }))
          .filter((page) => !hasReservedInternalSegment(page.relativePath)),
        errors: nativeResult.errors.map((e) => ({
          file: e.file,
          message: e.message,
          hooks: e.hooks,
        })),
      };

      if (result.clientComponents.length > 0 || !hasUseClientDirectiveInApp(appDir)) {
        return result;
      }

      if (process.env.VISTA_DEBUG) {
        console.warn(
          '[Vista RSC] Native scanner missed "use client" directives. Falling back to JS scanner.'
        );
      }
    }
  }

  // Fallback to JS-based scanner
  const errors: ScanError[] = [];
  const files = scanDirectory(appDir, appDir, errors);

  const result: ScanResult = {
    clientComponents: [],
    serverComponents: [],
    layouts: [],
    pages: [],
    errors,
  };

  for (const file of files) {
    const basename = path.basename(file.relativePath, path.extname(file.relativePath));

    // Categorize by file convention
    if (basename === 'root' || basename === 'layout') {
      result.layouts.push(file);
    } else if (basename === 'index' || basename === 'page') {
      if (!hasReservedInternalSegment(file.relativePath)) {
        result.pages.push(file);
      }
    } else if (basename === 'not-found') {
      result.notFound = file;
    } else if (basename === 'error') {
      result.error = file;
    } else if (basename === 'loading') {
      result.loading = file;
    }

    // Also categorize by client/server
    if (file.isClient) {
      result.clientComponents.push(file);
    } else {
      result.serverComponents.push(file);
    }
  }

  return result;
}

/**
 * Check if Rust native bindings are available
 */
export function isNativeAvailable(): boolean {
  return rustNative !== null || isRscNativeAvailable();
}

/**
 * Get version info
 */
export function getVersion(): string {
  if (rustNative && rustNative.version) {
    return rustNative.version();
  }
  return '0.1.0-js-fallback';
}
