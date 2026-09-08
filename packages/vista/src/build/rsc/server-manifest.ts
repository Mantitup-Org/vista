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

import fs from 'fs';
import path from 'path';
import {
  createComponentId,
  normalizeComponentPath,
  relativeComponentPath,
} from './component-identity';
import { BUILD_DIR } from '../../constants';
import { createExportServerReferenceId, createInlineServerActionId } from '../../server/runtime-actions';
import {
  type ResolvedSegmentConfig,
  type SegmentConfig,
  mergeSegmentConfigs,
  parseSegmentConfig,
} from '../../server/segment-config';
import {
  discoverRouteHandlers,
  type DiscoveredRouteHandler,
  type RouteHandlerMethod,
} from '../../server/route-handler-registry';

const RESERVED_INTERNAL_SEGMENTS = new Set(['[not-found]']);

function hasReservedInternalSegment(relativePath: string): boolean {
  return relativePath
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => RESERVED_INTERNAL_SEGMENTS.has(segment));
}

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
 * Check if source has 'use client' directive
 */
function hasClientDirective(source: string): boolean {
  let trimmed = source;
  while (true) {
    trimmed = trimmed.trimStart();
    if (trimmed.startsWith('//')) {
      const newlineIndex = trimmed.indexOf('\n');
      trimmed = newlineIndex === -1 ? '' : trimmed.slice(newlineIndex + 1);
      continue;
    }
    if (trimmed.startsWith('/*')) {
      const commentEndIndex = trimmed.indexOf('*/');
      if (commentEndIndex === -1) {
        break;
      }
      trimmed = trimmed.slice(commentEndIndex + 2);
      continue;
    }
    break;
  }
  if (trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"')) {
    return true;
  }

  if (rustNative?.isClientComponent) {
    return rustNative.isClientComponent(source);
  }

  return false;
}

function hasServerDirective(source: string): boolean {
  let trimmed = source;
  while (true) {
    trimmed = trimmed.trimStart();
    if (trimmed.startsWith('//')) {
      const newlineIndex = trimmed.indexOf('\n');
      trimmed = newlineIndex === -1 ? '' : trimmed.slice(newlineIndex + 1);
      continue;
    }
    if (trimmed.startsWith('/*')) {
      const commentEndIndex = trimmed.indexOf('*/');
      if (commentEndIndex === -1) {
        break;
      }
      trimmed = trimmed.slice(commentEndIndex + 2);
      continue;
    }
    break;
  }
  return trimmed.startsWith("'use server'") || trimmed.startsWith('"use server"');
}

function extractExports(source: string): string[] {
  const exports: string[] = [];

  if (/export\s+default\s+/.test(source)) {
    exports.push('default');
  }

  const namedExportRegex =
    /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = namedExportRegex.exec(source)) !== null) {
    exports.push(match[1]);
  }

  const reExportRegex = /export\s+\{([^}]+)\}/g;
  while ((match = reExportRegex.exec(source)) !== null) {
    const names = match[1]
      .split(',')
      .map((entry) =>
        entry
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
 * Check for metadata exports
 */
function analyzeMetadata(source: string): { hasMetadata: boolean; hasGenerateMetadata: boolean } {
  if (rustNative?.analyzeMetadata) {
    const result = rustNative.analyzeMetadata(source);
    return {
      hasMetadata: result.has_static_metadata,
      hasGenerateMetadata: result.has_generate_metadata,
    };
  }

  return {
    hasMetadata: /export\s+const\s+metadata\b/.test(source),
    hasGenerateMetadata: /export\s+(async\s+)?function\s+generateMetadata\b/.test(source),
  };
}

/**
 * Analyze route rendering configuration exports.
 *
 * Detects:
 *   export const dynamic = 'force-static' | 'force-dynamic' | 'auto' | 'error';
 *   export const revalidate = <number> | false;
 *   export async function generateStaticParams() { ... }
 */
function analyzeRenderConfig(source: string): {
  renderMode: 'static' | 'dynamic' | 'auto';
  revalidate?: number;
  hasGenerateStaticParams: boolean;
  segmentConfig: SegmentConfig;
} {
  const parsedSegmentConfig = parseSegmentConfig(source, '<inline>');
  let renderMode: 'static' | 'dynamic' | 'auto' = 'auto';
  let revalidate: number | undefined;
  const hasGenerateStaticParams = /export\s+(async\s+)?function\s+generateStaticParams\b/.test(
    source
  );

  if (parsedSegmentConfig.config.dynamic === 'force-static' || parsedSegmentConfig.config.dynamic === 'error') {
    renderMode = 'static';
  } else if (parsedSegmentConfig.config.dynamic === 'force-dynamic') {
      renderMode = 'dynamic';
  }

  if (typeof parsedSegmentConfig.config.revalidate === 'number') {
    revalidate = parsedSegmentConfig.config.revalidate;
  }

  return {
    renderMode,
    revalidate,
    hasGenerateStaticParams,
    segmentConfig: parsedSegmentConfig.config,
  };
}

/**
 * Determine component type from file name
 */
function getComponentType(fileName: string): ServerComponentEntry['type'] {
  const base = path.basename(fileName).replace(/\.[jt]sx?$/, '');
  switch (base) {
    case 'page':
    case 'index':
      return 'page';
    case 'layout':
    case 'root':
      return 'layout';
    case 'loading':
      return 'loading';
    case 'error':
      return 'error';
    case 'default':
      return 'default';
    case 'not-found':
      return 'not-found';
    default:
      return 'component';
  }
}

function isRouteGroupSegment(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')');
}

function isParallelRouteSegment(segment: string): boolean {
  return segment.startsWith('@');
}

function isInterceptionRouteSegment(segment: string): boolean {
  return (
    segment.startsWith('(.)') ||
    segment.startsWith('(..)') ||
    segment.startsWith('(..)(..)') ||
    segment.startsWith('(...)')
  );
}

function hasNonPublicRouteSegment(relativePath: string): boolean {
  return relativePath
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => isParallelRouteSegment(segment) || isInterceptionRouteSegment(segment));
}

/**
 * Extract client component imports from source
 */
function extractClientImports(source: string, appDir: string): string[] {
  const imports: string[] = [];

  // Match import statements
  const importRegex = /import\s+(?:[\w\s{},*]+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(source)) !== null) {
    const importPath = match[1];

    // Skip node_modules
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue;

    // This is a relative import - we'd need to resolve and check if it's a client component
    // For now, we'll mark it as a potential dependency
    imports.push(importPath);
  }

  return imports;
}

function analyzeServerActions(
  source: string,
  absolutePath: string
): ServerActionEntry[] {
  const entries: ServerActionEntry[] = [];

  if (hasServerDirective(source)) {
    for (const exportName of extractExports(source)) {
      entries.push({
        id: createExportServerReferenceId(absolutePath, exportName),
        filePath: absolutePath,
        kind: 'module-export',
        exportName,
      });
    }
  }

  const inlineMatches: Array<{ name: string; index: number }> = [];
  const declarationRegex =
    /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*['"]use server['"]/g;
  const assignedRegex =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b[^{]*\{|\([^)]*\)\s*=>\s*\{|\w+\s*=>\s*\{)\s*['"]use server['"]/g;

  let match: RegExpExecArray | null;
  while ((match = declarationRegex.exec(source)) !== null) {
    inlineMatches.push({ name: match[1], index: match.index });
  }
  while ((match = assignedRegex.exec(source)) !== null) {
    inlineMatches.push({ name: match[1], index: match.index });
  }

  inlineMatches
    .sort((a, b) => a.index - b.index)
    .forEach(({ name }, index) => {
    entries.push({
      id: createInlineServerActionId(absolutePath, index, name),
      filePath: absolutePath,
      kind: 'inline',
      exportName: name,
    });
    });

  return entries;
}

/**
 * Scan directory recursively for server components
 */
function scanForServerComponents(
  dir: string,
  appDir: string,
  components: ServerComponentEntry[]
): void {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      if (!item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'api') {
        scanForServerComponents(fullPath, appDir, components);
      }
    } else if (item.isFile()) {
      const ext = path.extname(item.name);
      if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext)) continue;
      const base = path.basename(item.name, ext);
      if (base === 'route') continue;

      try {
        const source = fs.readFileSync(fullPath, 'utf-8');

        // Only add if NOT a client component
        if (!hasClientDirective(source)) {
          const relativePath = relativeComponentPath(appDir, fullPath);
          const moduleId = createComponentId('server', relativePath);
          const metadata = analyzeMetadata(source);
          const renderConfig = analyzeRenderConfig(source);

          components.push({
            id: moduleId,
            path: relativePath,
            absolutePath: fullPath,
            type: getComponentType(item.name),
            hasMetadata: metadata.hasMetadata,
            hasGenerateMetadata: metadata.hasGenerateMetadata,
            hasGenerateStaticParams: renderConfig.hasGenerateStaticParams,
            renderMode: renderConfig.renderMode,
            revalidate: renderConfig.revalidate,
            segmentConfig: renderConfig.segmentConfig,
            clientDependencies: extractClientImports(source, appDir),
          });
        }
      } catch (e) {
        console.warn(`[Vista RSC] Failed to read ${fullPath}:`, e);
      }
    }
  }
}

/**
 * Build route entries from discovered components
 */
function buildRoutes(components: ServerComponentEntry[], appDir: string): RouteEntry[] {
  const routes: RouteEntry[] = [];
  const pages = components.filter((c) => c.type === 'page');
  const layouts = components.filter((c) => c.type === 'layout');
  const loadings = components.filter((c) => c.type === 'loading');
  const errors = components.filter((c) => c.type === 'error');
  const layoutsByDir = new Map<string, ServerComponentEntry>();

  for (const layout of layouts) {
    const dir = path.dirname(layout.absolutePath);
    const existing = layoutsByDir.get(dir);
    const layoutBase = path.basename(layout.absolutePath).replace(/\.[jt]sx?$/, '');
    const existingBase = existing
      ? path.basename(existing.absolutePath).replace(/\.[jt]sx?$/, '')
      : null;

    // Canonical preference: root.* over layout.* in the same directory.
    if (!existing || (layoutBase === 'root' && existingBase !== 'root')) {
      layoutsByDir.set(dir, layout);
    }
  }

  for (const page of pages) {
    const pageDir = path.dirname(page.absolutePath);
    const relativePath = path.relative(appDir, pageDir);

    if (hasReservedInternalSegment(relativePath) || hasNonPublicRouteSegment(relativePath)) {
      continue;
    }

    const sourceSegments = relativePath
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean);

    // Build URL pattern
    let pattern = '/' + relativePath.replace(/\\/g, '/');
    let routeType: RouteEntry['type'] = 'static';

    // Handle dynamic segments
    pattern = pattern
      .replace(/\[\.\.\.([^\]]+)\]/g, (_, name) => {
        routeType = 'catch-all';
        return `:${name}*`;
      })
      .replace(/\[([^\]]+)\]/g, (_, name) => {
        if (routeType !== 'catch-all') routeType = 'dynamic';
        return `:${name}`;
      });

    // Handle route groups - remove (groupname) from URL
    pattern = pattern.replace(/\/\([^)]+\)/g, '');

    // Root page
    if (pattern === '/' || pattern === '') {
      pattern = '/';
    }

    // Find layouts in ancestor directories
    const layoutPaths: string[] = [];
    let currentDir = pageDir;

    while (currentDir.startsWith(appDir)) {
      const layout = layoutsByDir.get(currentDir);
      if (layout) {
        layoutPaths.unshift(layout.absolutePath);
      }

      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }

    // Find loading and error in same directory
    const loading = loadings.find((l) => path.dirname(l.absolutePath) === pageDir);
    const error = errors.find((e) => path.dirname(e.absolutePath) === pageDir);

    // Determine rendering mode from page exports
    let renderMode: RouteEntry['renderMode'] = 'dynamic'; // default: dynamic
    const pageRevalidate = page.revalidate;
    const hasStaticParams = page.hasGenerateStaticParams;
    const pageRenderMode = page.renderMode as string;
    // Cast routeType to string — TS can't track mutations from .replace() callbacks
    const rt = routeType as string;
    const mergedSegmentConfig = mergeSegmentConfigs([
      ...layoutPaths.map((layoutPath) => layouts.find((layout) => layout.absolutePath === layoutPath)),
      page,
    ]);

    if (mergedSegmentConfig.dynamic === 'force-static' || pageRenderMode === 'static') {
      renderMode = 'static';
    } else if (mergedSegmentConfig.dynamic === 'force-dynamic' || pageRenderMode === 'dynamic') {
      renderMode = 'dynamic';
    } else if (pageRevalidate !== undefined && pageRevalidate > 0) {
      renderMode = 'isr';
    } else if (rt === 'static' && pageRenderMode === 'auto') {
      // Static URL pattern + auto mode = static by default
      renderMode = 'static';
    } else if ((rt === 'dynamic' || rt === 'catch-all') && hasStaticParams) {
      // Dynamic or catch-all URL pattern + generateStaticParams = can be statically generated
      renderMode = 'static';
    }

    routes.push({
      pattern,
      pagePath: page.absolutePath,
      routeDir: pageDir,
      sourceSegments,
      layoutPaths,
      loadingPath: loading?.absolutePath,
      errorPath: error?.absolutePath,
      type: routeType,
      renderMode,
      revalidate:
        typeof mergedSegmentConfig.revalidate === 'number'
          ? mergedSegmentConfig.revalidate
          : pageRevalidate,
      hasGenerateStaticParams: hasStaticParams,
      segmentConfig: mergedSegmentConfig,
    });
  }

  // Sort routes: static first, then dynamic, then catch-all
  routes.sort((a, b) => {
    const order = { static: 0, dynamic: 1, 'catch-all': 2 };
    return order[a.type] - order[b.type];
  });

  return routes;
}

/**
 * Generate the server component manifest
 */
export function generateServerManifest(cwd: string, appDir: string): ServerManifest {
  const components: ServerComponentEntry[] = [];
  const serverActions: Record<string, ServerActionEntry> = {};

  scanForServerComponents(appDir, appDir, components);

  const serverModules: Record<string, ServerComponentEntry> = {};
  const pathToId: Record<string, string> = {};

  for (const component of components) {
    serverModules[component.id] = component;
    const normalizedRelativePath = normalizeComponentPath(component.path);
    const normalizedAbsolutePath = normalizeComponentPath(component.absolutePath);

    pathToId[component.path] = component.id;
    pathToId[normalizedRelativePath] = component.id;
    pathToId[component.absolutePath] = component.id;
    pathToId[normalizedAbsolutePath] = component.id;

    try {
      const source = fs.readFileSync(component.absolutePath, 'utf-8');
      for (const action of analyzeServerActions(source, component.absolutePath)) {
        serverActions[action.id] = action;
      }
    } catch {
      // Ignore per-file action analysis failures and keep manifest generation resilient.
    }
  }

  const routes = buildRoutes(components, appDir);
  const routeHandlers = buildRouteHandlerEntries(appDir);

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
    serverModules,
    pathToId,
    routes,
    serverActions,
    routeHandlers,
  };
}

/**
 * Collect file-based API route handlers.
 *
 * Route handlers live in the same `app/` tree as pages but are not React components,
 * so they are discovered separately from `scanForServerComponents` (which skips the
 * `api` directory and treats every file it finds as a component).
 */
function buildRouteHandlerEntries(appDir: string): RouteHandlerEntry[] {
  return discoverRouteHandlers(appDir).map((handler: DiscoveredRouteHandler) => ({
    pattern: handler.pattern,
    filePath: handler.filePath,
    sourceSegments: handler.sourceSegments,
    type: handler.type,
    methods: handler.methods,
    ...(handler.runtime ? { runtime: handler.runtime } : {}),
  }));
}

/**
 * Get server component by path
 */
export function getServerComponent(
  manifest: ServerManifest,
  filePath: string
): ServerComponentEntry | undefined {
  const moduleId = manifest.pathToId[filePath];
  if (!moduleId) return undefined;
  return manifest.serverModules[moduleId];
}

/**
 * Check if a path is a server component
 */
export function isServerComponentPath(manifest: ServerManifest, filePath: string): boolean {
  return filePath in manifest.pathToId;
}
