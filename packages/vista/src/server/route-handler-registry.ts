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

import fs from 'fs';
import path from 'path';

import {
  compareRouteSpecificity,
  isParallelRouteSegment,
  isInterceptionRouteSegment,
  matchRouteSegments,
  parseRouteSegments,
  splitRequestPath,
  type ParsedRoute,
  type RouteParams,
  type RouteSegmentType,
} from './route-patterns';

/** Supported HTTP methods for a route handler, in canonical order. */
export const ROUTE_HANDLER_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;

export type RouteHandlerMethod = (typeof ROUTE_HANDLER_METHODS)[number];

const ROUTE_FILE_BASENAMES = new Set(['route']);
const ROUTE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIPPED_DIRECTORIES = new Set(['node_modules']);

/** How long a discovery result is reused in dev before the app dir is re-scanned. */
const DEV_SCAN_TTL_MS = 250;

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

function isRouteFile(fileName: string): boolean {
  const extension = path.extname(fileName);
  if (!ROUTE_FILE_EXTENSIONS.has(extension)) {
    return false;
  }
  return ROUTE_FILE_BASENAMES.has(path.basename(fileName, extension));
}

/**
 * Read the exported HTTP methods and requested runtime without executing the module.
 *
 * Regex-based on purpose: this mirrors how build/rsc/server-manifest.ts already reads
 * exports, runs during a filesystem walk, and only feeds the manifest. The runtime
 * dispatch path reads the real module exports, so a miss here degrades the manifest,
 * never the request.
 */
function readRouteFileMetadata(filePath: string): {
  methods: RouteHandlerMethod[];
  runtime?: string;
} {
  let source = '';
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { methods: [] };
  }

  const methods: RouteHandlerMethod[] = [];
  for (const method of ROUTE_HANDLER_METHODS) {
    const declaration = new RegExp(
      `export\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${method}\\b`
    );
    const braced = new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`);
    if (declaration.test(source) || braced.test(source)) {
      methods.push(method);
    }
  }

  const runtimeMatch = /export\s+const\s+runtime\s*=\s*['"]([\w-]+)['"]/.exec(source);

  return {
    methods,
    runtime: runtimeMatch ? runtimeMatch[1] : undefined,
  };
}

function walkForRouteFiles(
  dir: string,
  appDir: string,
  results: DiscoveredRouteHandler[]
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      // Parallel slots and interception routes are page-tree concepts; a route
      // handler underneath one is not reachable by URL.
      if (isParallelRouteSegment(entry.name) || isInterceptionRouteSegment(entry.name)) {
        continue;
      }
      walkForRouteFiles(fullPath, appDir, results);
      continue;
    }

    if (!entry.isFile() || !isRouteFile(entry.name)) {
      continue;
    }

    const relativeDir = path.relative(appDir, dir);
    const sourceSegments = relativeDir
      .split(path.sep)
      .filter((segment) => segment && segment !== '.');

    const parsed = parseRouteSegments(sourceSegments);
    if (!parsed) {
      continue;
    }

    const metadata = readRouteFileMetadata(fullPath);
    results.push({
      pattern: parsed.pattern,
      filePath: fullPath,
      sourceSegments,
      type: parsed.type,
      methods: metadata.methods,
      runtime: metadata.runtime,
      parsed,
    });
  }
}

/**
 * Scan an app directory for route handler files.
 *
 * Results are ordered most-specific first, so the first match during resolution is
 * the correct one.
 */
export function discoverRouteHandlers(appDir: string): DiscoveredRouteHandler[] {
  if (!appDir || !fs.existsSync(appDir)) {
    return [];
  }

  const results: DiscoveredRouteHandler[] = [];
  walkForRouteFiles(appDir, appDir, results);

  // A directory can hold at most one route file; if several extensions exist, keep a
  // deterministic winner rather than letting readdir order decide.
  const byPattern = new Map<string, DiscoveredRouteHandler>();
  for (const entry of results) {
    const existing = byPattern.get(entry.pattern);
    if (!existing || entry.filePath.localeCompare(existing.filePath) < 0) {
      byPattern.set(entry.pattern, entry);
    }
  }

  return Array.from(byPattern.values()).sort((a, b) =>
    compareRouteSpecificity(a.parsed, b.parsed)
  );
}

type CacheEntry = {
  handlers: DiscoveredRouteHandler[];
  scannedAt: number;
};

const discoveryCache = new Map<string, CacheEntry>();

/**
 * Cached variant of {@link discoverRouteHandlers}.
 *
 * Production builds scan once. Dev re-scans at most every {@link DEV_SCAN_TTL_MS},
 * which keeps newly added route files visible without turning every request into a
 * full directory walk.
 */
export function getRouteHandlers(
  appDir: string,
  options: { isDev?: boolean } = {}
): DiscoveredRouteHandler[] {
  const cached = discoveryCache.get(appDir);
  const now = Date.now();

  if (cached && (!options.isDev || now - cached.scannedAt < DEV_SCAN_TTL_MS)) {
    return cached.handlers;
  }

  const handlers = discoverRouteHandlers(appDir);
  discoveryCache.set(appDir, { handlers, scannedAt: now });
  return handlers;
}

/** Drop cached discovery results. Exported for tests and for watch-mode invalidation. */
export function clearRouteHandlerCache(appDir?: string): void {
  if (appDir) {
    discoveryCache.delete(appDir);
    return;
  }
  discoveryCache.clear();
}

/**
 * Resolve a request path to a route handler file and its dynamic params.
 *
 * Returns null when no route file matches, leaving the caller free to fall through to
 * pages, the typed API, or a 404.
 */
export function resolveRouteHandler(
  appDir: string,
  requestPath: string,
  options: { isDev?: boolean } = {}
): ResolvedRouteHandler | null {
  const handlers = getRouteHandlers(appDir, options);
  if (handlers.length === 0) {
    return null;
  }

  const requestSegments = splitRequestPath(requestPath);

  for (const handler of handlers) {
    const params = matchRouteSegments(handler.parsed, requestSegments);
    if (params) {
      return {
        filePath: handler.filePath,
        pattern: handler.pattern,
        params,
      };
    }
  }

  return null;
}
