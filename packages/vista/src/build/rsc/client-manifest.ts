/**
 * Client Component Manifest Generator
 *
 * Scans the app directory and builds a manifest of all Client Components.
 * Client components are those with 'use client' directive.
 *
 * The manifest maps component paths to their chunk names for client-side loading.
 */

import fs from 'fs';
import path from 'path';
import {
  createChunkName,
  createComponentId,
  normalizeComponentPath,
  relativeComponentPath,
} from './component-identity';
import { STATIC_CHUNKS_PATH, BUILD_DIR } from '../../constants';

// Try to load Rust NAPI bindings
let rustNative: any = null;
try {
  const possiblePaths = [
    path.resolve(__dirname, '../../../../../crates/vista-napi'),
    path.resolve(__dirname, '../../../../crates/vista-napi'),
  ];

  for (const p of possiblePaths) {
    try {
      rustNative = require(p);
      break;
    } catch (e) {
      // Try next
    }
  }
} catch (e) {
  // Fallback to JS
}

export interface ClientComponentEntry {
  /** Unique ID for this component */
  id: string;
  /** Relative path from app directory */
  path: string;
  /** Absolute file path */
  absolutePath: string;
  /** Generated chunk name */
  chunkName: string;
  /** Exported names from this module */
  exports: string[];
  /** Is async/lazy loaded */
  async: boolean;
}

export interface ClientManifest {
  /** Build ID for cache busting */
  buildId: string;
  /** Map of module ID to client component info */
  clientModules: Record<string, ClientComponentEntry>;
  /** Map of module path to module ID (for lookups) */
  pathToId: Record<string, string>;
  /** SSR module mapping (server paths to client chunks) */
  ssrModuleMapping: Record<string, string>;
}

/**
 * Check if source has 'use client' directive
 */
function hasClientDirective(source: string): boolean {
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
 * Extract export names from source (simple regex approach)
 */
function extractExports(source: string): string[] {
  const exports: string[] = [];

  // Default export
  if (/export\s+default\s+/.test(source)) {
    exports.push('default');
  }

  // Named exports: export function Name, export const Name, export class Name
  const namedExportRegex =
    /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Z][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = namedExportRegex.exec(source)) !== null) {
    exports.push(match[1]);
  }

  // Export { Name1, Name2 }
  const reExportRegex = /export\s+\{([^}]+)\}/g;
  while ((match = reExportRegex.exec(source)) !== null) {
    const names = match[1]
      .split(',')
      .map((n) =>
        n
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim()
      )
      .filter(Boolean);
    exports.push(...(names as string[]));
  }

  return [...new Set(exports)];
}

/**
 * Scan directory recursively for client components
 */
function scanForClientComponents(
  dir: string,
  scanRoot: string,
  components: ClientComponentEntry[],
  pathPrefix: string = ''
): void {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      if (!item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'api') {
        scanForClientComponents(fullPath, scanRoot, components, pathPrefix);
      }
    } else if (item.isFile()) {
      const ext = path.extname(item.name);
      if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext)) continue;
      const base = path.basename(item.name, ext);
      if (base === 'route') continue;

      try {
        const source = fs.readFileSync(fullPath, 'utf-8');

        if (hasClientDirective(source)) {
          const relativePathBase = relativeComponentPath(scanRoot, fullPath);
          const relativePath = pathPrefix ? `${pathPrefix}${relativePathBase}` : relativePathBase;
          const moduleId = createComponentId('client', relativePath);

          components.push({
            id: moduleId,
            path: relativePath,
            absolutePath: fullPath,
            chunkName: createChunkName(relativePath),
            exports: extractExports(source),
            async: false,
          });
        }
      } catch (e) {
        console.warn(`[Vista RSC] Failed to read ${fullPath}:`, e);
      }
    }
  }
}

/**
 * Generate the client component manifest
 */
export function generateClientManifest(cwd: string, appDir: string): ClientManifest {
  return generateClientManifestWithRoots(cwd, appDir);
}

export function generateClientManifestWithRoots(
  cwd: string,
  appDir: string,
  additionalRoots: Array<{ dir: string; prefix?: string }> = []
): ClientManifest {
  const components: ClientComponentEntry[] = [];

  scanForClientComponents(appDir, appDir, components);

  for (const root of additionalRoots) {
    if (!fs.existsSync(root.dir)) continue;
    scanForClientComponents(root.dir, root.dir, components, root.prefix || '');
  }

  const clientModules: Record<string, ClientComponentEntry> = {};
  const pathToId: Record<string, string> = {};
  const ssrModuleMapping: Record<string, string> = {};

  for (const component of components) {
    clientModules[component.id] = component;
    const normalizedRelativePath = normalizeComponentPath(component.path);
    const normalizedAbsolutePath = normalizeComponentPath(component.absolutePath);

    pathToId[component.path] = component.id;
    pathToId[normalizedRelativePath] = component.id;
    pathToId[component.absolutePath] = component.id;
    pathToId[normalizedAbsolutePath] = component.id;

    // Map server path to client chunk for SSR
    ssrModuleMapping[component.absolutePath] = `${STATIC_CHUNKS_PATH}${component.chunkName}.js`;
    ssrModuleMapping[normalizedAbsolutePath] = `${STATIC_CHUNKS_PATH}${component.chunkName}.js`;
  }

  // Get or generate build ID
  const buildIdPath = path.join(cwd, BUILD_DIR, 'BUILD_ID');
  let buildId = 'dev';
  try {
    if (fs.existsSync(buildIdPath)) {
      buildId = fs.readFileSync(buildIdPath, 'utf-8').trim();
    }
  } catch (e) {
    // Use dev
  }

  return {
    buildId,
    clientModules,
    pathToId,
    ssrModuleMapping,
  };
}

/**
 * Get client component info by module ID
 */
export function getClientComponent(
  manifest: ClientManifest,
  moduleId: string
): ClientComponentEntry | undefined {
  return manifest.clientModules[moduleId];
}

/**
 * Get client component by file path
 */
export function getClientComponentByPath(
  manifest: ClientManifest,
  filePath: string
): ClientComponentEntry | undefined {
  const moduleId = manifest.pathToId[filePath];
  if (!moduleId) return undefined;
  return manifest.clientModules[moduleId];
}

/**
 * Check if a path is a client component
 */
export function isClientComponentPath(manifest: ClientManifest, filePath: string): boolean {
  return filePath in manifest.pathToId;
}
