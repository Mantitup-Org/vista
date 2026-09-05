/**
 * Vista Build Utilities
 *
 * Generates build manifests, BUILD_ID, and manages .vista output structure.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BUILD_DIR, FLASH_DIR, IMAGE_ENDPOINT, STATIC_CHUNKS_PATH } from '../constants';
import type { VistaEngineVariant } from '../config';
import type { ImageConfig } from '../image/image-config';
import { generateBuildWatermark } from '../integrity';

// ============================================================================
// BUILD_ID Generation
// ============================================================================

/**
 * Generate a unique build ID based on timestamp and random bytes.
 */
export function generateBuildId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Read existing BUILD_ID or generate a new one.
 */
export function getBuildId(vistaDir: string, forceNew: boolean = false): string {
  const buildIdPath = path.join(vistaDir, 'BUILD_ID');

  if (!forceNew && fs.existsSync(buildIdPath)) {
    return fs.readFileSync(buildIdPath, 'utf-8').trim();
  }

  const buildId = generateBuildId();
  fs.mkdirSync(vistaDir, { recursive: true });
  fs.writeFileSync(buildIdPath, buildId);
  return buildId;
}

// ============================================================================
// Directory Structure
// ============================================================================

export interface VistaDirs {
  root: string; // .vista/
  cache: string; // .vista/cache/
  imageCache: string; // .vista/cache/images/
  server: string; // .vista/server/
  static: string; // .vista/static/
  chunks: string; // .vista/static/chunks/
  css: string; // .vista/static/css/ (reserved; created lazily when needed)
  media: string; // .vista/static/media/ (reserved; created lazily when needed)
}

/**
 * Create the .vista directory structure.
 * In legacy mode, only creates root (no empty server/static dirs).
 * In RSC mode, creates the full structure for server/client bundles.
 */
export function createVistaDirectories(cwd: string, mode: 'legacy' | 'rsc' = 'legacy'): VistaDirs {
  const root = path.join(cwd, BUILD_DIR);

  const dirs: VistaDirs = {
    root,
    cache: path.join(root, 'cache'),
    imageCache: path.join(root, 'cache', 'images'),
    server: path.join(root, 'server'),
    static: path.join(root, 'static'),
    chunks: path.join(root, 'static', 'chunks'),
    css: path.join(root, 'static', 'css'),
    media: path.join(root, 'static', 'media'),
  };

  // Always create root
  fs.mkdirSync(root, { recursive: true });

  if (mode === 'rsc') {
    [dirs.root, dirs.cache, dirs.imageCache, dirs.server, dirs.static, dirs.chunks, dirs.media].forEach((dir) => {
      fs.mkdirSync(dir, { recursive: true });
    });
  }
  // Legacy mode: only root dir is created — webpack outputs directly into .vista/

  return dirs;
}

// ============================================================================
// Build Manifest
// ============================================================================

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
export function generateBuildManifest(
  vistaDir: string,
  buildId: string,
  pages: Record<string, string[]> = {}
): BuildManifest {
  const manifest: BuildManifest = {
    buildId,
    polyfillFiles: [],
    devFiles: [],
    lowPriorityFiles: [],
    rootMainFiles: [`${STATIC_CHUNKS_PATH}webpack.js`, `${STATIC_CHUNKS_PATH}main.js`],
    pages,
  };

  const manifestPath = path.join(vistaDir, 'build-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return manifest;
}

interface RouteLike {
  pattern: string;
  pagePath: string;
  type?: 'static' | 'dynamic' | 'catch-all';
}

function toRegexFromPattern(pattern: string): string {
  if (pattern === '/') {
    return '^/$';
  }

  const normalized = pattern.startsWith('/') ? pattern.slice(1) : pattern;
  const parts = normalized.split('/').filter(Boolean);

  const regexParts = parts.map((part) => {
    if (!part.startsWith(':')) {
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const dynamicMatch = /^:([a-zA-Z0-9_]+)(\*)?(\?)?$/.exec(part);
    if (!dynamicMatch) {
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const [, paramName, isCatchAll, isOptional] = dynamicMatch;

    if (isCatchAll && isOptional) {
      return `(?<${paramName}>.*)`;
    }

    if (isCatchAll) {
      return `(?<${paramName}>.+)`;
    }

    return `(?<${paramName}>[^/]+)`;
  });

  return `^/${regexParts.join('/')}$`;
}

export interface RouteHandlerLike {
  pattern: string;
  filePath: string;
  type?: 'static' | 'dynamic' | 'catch-all';
  methods?: string[];
  runtime?: string;
}

function toRouteHandlerInfo(handler: RouteHandlerLike): RouteHandlerInfo {
  return {
    page: handler.filePath,
    regex: toRegexFromPattern(handler.pattern),
    namedRegex: toRegexFromPattern(handler.pattern),
    routeKeys: {},
    methods: handler.methods || [],
    ...(handler.runtime ? { runtime: handler.runtime } : {}),
  };
}

function toRouteInfo(route: RouteLike): RouteInfo {
  return {
    page: route.pagePath,
    regex: toRegexFromPattern(route.pattern),
    routeKeys: {},
    namedRegex: toRegexFromPattern(route.pattern),
  };
}

export function generateAppPathRoutesManifest(
  vistaDir: string,
  routes: RouteLike[] = [],
  routeHandlers: RouteHandlerLike[] = []
): Record<string, string> {
  const manifest: Record<string, string> = {};
  routes.forEach((route) => {
    manifest[route.pattern] = route.pagePath;
  });
  // A page and a route handler cannot both own a URL. Pages win, so a stray
  // `route.ts` next to a `page.tsx` cannot silently take over the route.
  routeHandlers.forEach((handler) => {
    if (!(handler.pattern in manifest)) {
      manifest[handler.pattern] = handler.filePath;
    }
  });
  fs.writeFileSync(
    path.join(vistaDir, 'app-path-routes-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  return manifest;
}

export function generatePrerenderManifest(vistaDir: string): void {
  const manifest = {
    version: 1,
    routes: {},
    dynamicRoutes: {},
    notFoundRoutes: [],
    preview: {
      previewModeId: '',
      previewModeSigningKey: '',
      previewModeEncryptionKey: '',
    },
  };
  fs.writeFileSync(
    path.join(vistaDir, 'prerender-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
}

export function generateRequiredServerFilesManifest(
  cwd: string,
  vistaDir: string,
  extraFiles: string[] = [],
  appDir: string = cwd
): void {
  const files = Array.from(
    new Set([
      `${BUILD_DIR}/BUILD_ID`,
      `${BUILD_DIR}/build-manifest.json`,
      `${BUILD_DIR}/routes-manifest.json`,
      `${BUILD_DIR}/app-path-routes-manifest.json`,
      `${BUILD_DIR}/server/server-manifest.json`,
      ...extraFiles,
    ])
  );

  const manifest = {
    version: 1,
    config: {},
    appDir,
    relativeAppDir: path.relative(cwd, appDir) || '.',
    files,
  };
  fs.writeFileSync(
    path.join(vistaDir, 'required-server-files.json'),
    JSON.stringify(manifest, null, 2)
  );
}

export function ensureJsonFile(
  vistaDir: string,
  relativePath: string,
  fallback: unknown = {}
): void {
  const absolutePath = path.join(vistaDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fs.writeFileSync(absolutePath, JSON.stringify(fallback, null, 2));
  }
}

export function writeArtifactManifest(
  vistaDir: string,
  buildId: string,
  extraManifestEntries: Partial<ArtifactManifest['manifests']> = {}
): ArtifactManifest {
  const artifactManifest: ArtifactManifest = {
    schemaVersion: 1,
    buildId,
    generatedAt: new Date().toISOString(),
    __integrity: generateBuildWatermark(),
    manifests: {
      buildManifest: 'build-manifest.json',
      routesManifest: 'routes-manifest.json',
      appPathRoutesManifest: 'app-path-routes-manifest.json',
      prerenderManifest: 'prerender-manifest.json',
      requiredServerFiles: 'required-server-files.json',
      reactClientManifest: 'react-client-manifest.json',
      reactServerManifest: 'react-server-manifest.json',
      ...extraManifestEntries,
    },
  };
  fs.writeFileSync(
    path.join(vistaDir, 'artifact-manifest.json'),
    JSON.stringify(artifactManifest, null, 2)
  );
  return artifactManifest;
}

export function writeCanonicalVistaArtifacts(
  cwd: string,
  vistaDir: string,
  buildId: string,
  routes: RouteLike[] = [],
  routeHandlers: RouteHandlerLike[] = []
): ArtifactManifest {
  const staticRoutes = routes.filter((route) => route.type === 'static').map(toRouteInfo);
  const dynamicRoutes = routes.filter((route) => route.type !== 'static').map(toRouteInfo);

  generateBuildManifest(vistaDir, buildId);
  generateRoutesManifest(vistaDir, staticRoutes, dynamicRoutes, routeHandlers);
  generateAppPathRoutesManifest(vistaDir, routes, routeHandlers);
  generatePrerenderManifest(vistaDir);
  generateRequiredServerFilesManifest(cwd, vistaDir);

  // Keep canonical React manifest filenames present for validation consistency.
  ensureJsonFile(vistaDir, 'react-client-manifest.json', {});
  ensureJsonFile(vistaDir, 'react-server-manifest.json', {});

  return writeArtifactManifest(vistaDir, buildId);
}

interface WriteReservedVistaArtifactsOptions {
  buildId: string;
  engineVariant?: VistaEngineVariant;
  imagesConfig?: Partial<ImageConfig> | undefined;
}

export function writeReservedVistaArtifacts(
  vistaDir: string,
  options: WriteReservedVistaArtifactsOptions
): void {
  const engineVariant = options.engineVariant || 'default';
  const generatedAt = new Date().toISOString();
  const cacheDir = path.join(vistaDir, 'cache');
  const imageCacheDir = path.join(cacheDir, 'images');
  const mediaDir = path.join(vistaDir, 'static', 'media');

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(imageCacheDir, { recursive: true });
  fs.mkdirSync(mediaDir, { recursive: true });

  fs.writeFileSync(
    path.join(cacheDir, 'cache-manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        buildId: options.buildId,
        generatedAt,
        engine: engineVariant,
        activeCacheRoot: engineVariant === 'flashpack' ? '.flash/cache' : '.vista/cache/webpack',
        directories: {
          localCache: '.vista/cache',
          webpack:
            engineVariant === 'flashpack' ? '.flash/cache/webpack' : '.vista/cache/webpack',
          images: '.vista/cache/images',
        },
        notes: [
          engineVariant === 'flashpack'
            ? 'Flashpack stores its hot build cache in .flash while .vista/cache keeps framework metadata.'
            : 'Default engine stores framework metadata here and may add webpack cache artifacts during rebuilds.',
        ],
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(imageCacheDir, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        buildId: options.buildId,
        generatedAt,
        endpoint: IMAGE_ENDPOINT,
        cacheDirectory: '.vista/cache/images',
        config: options.imagesConfig || {},
        behavior: {
          optimization: 'on-demand',
          staticImportsEmitInto: '.vista/static/media',
          publicReferencesStayIn: 'public/',
        },
      },
      null,
      2
    )
  );

  const emittedMedia = fs
    .readdirSync(mediaDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== 'media-manifest.json')
    .map((entry) => entry.name)
    .sort();

  fs.writeFileSync(
    path.join(mediaDir, 'media-manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        buildId: options.buildId,
        generatedAt,
        mediaDirectory: '.vista/static/media',
        emittedFiles: emittedMedia,
        note:
          'This directory is reserved for emitted media assets. Public file references are served from public/ and may leave this list empty.',
      },
      null,
      2
    )
  );
}

// ============================================================================
// Routes Manifest
// ============================================================================

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
export function generateRoutesManifest(
  vistaDir: string,
  staticRoutes: RouteInfo[] = [],
  dynamicRoutes: RouteInfo[] = [],
  routeHandlers: RouteHandlerLike[] = []
): RoutesManifest {
  const manifest: RoutesManifest = {
    version: 1,
    basePath: '',
    redirects: [],
    rewrites: [],
    headers: [],
    staticRoutes,
    dynamicRoutes,
    routeHandlers: routeHandlers.map(toRouteHandlerInfo),
  };

  const manifestPath = path.join(vistaDir, 'routes-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return manifest;
}

// ============================================================================
// Client Components Manifest
// ============================================================================

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
export function generateClientComponentsManifest(
  vistaDir: string,
  buildId: string,
  clientModules: Record<string, ClientComponentInfo> = {}
): ClientComponentsManifest {
  const manifest: ClientComponentsManifest = {
    buildId,
    clientModules,
  };

  const manifestPath = path.join(vistaDir, 'client-components-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return manifest;
}

// ============================================================================
// Server Components Manifest
// ============================================================================

export interface ServerComponentInfo {
  filePath: string;
  hasMetadata: boolean;
  hasGenerateMetadata: boolean;
}

/**
 * Generate manifest of server components.
 */
export function generateServerComponentsManifest(
  vistaDir: string,
  serverModules: Record<string, ServerComponentInfo> = {}
): void {
  const manifest = {
    serverModules,
  };

  const manifestPath = path.join(vistaDir, 'server', 'server-components-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Get Webpack cache configuration for persistent caching.
 */
export function getWebpackCacheConfig(
  vistaDir: string,
  buildId: string,
  name: string,
  engineVariant: VistaEngineVariant = 'default',
  cwd: string = process.cwd()
) {
  const cacheDirectory =
    engineVariant === 'flashpack'
      ? path.join(cwd, FLASH_DIR, 'cache', 'webpack')
      : path.join(vistaDir, 'cache', 'webpack');

  return {
    type: 'filesystem' as const,
    version: buildId,
    cacheDirectory,
    name: name,
    buildDependencies: {
      config: [__filename],
    },
  };
}

/**
 * Clean old cache entries (keeps last N builds).
 */
export function cleanOldCache(vistaDir: string, keepBuilds: number = 5): void {
  const cacheDir = path.join(vistaDir, 'cache', 'webpack');

  if (!fs.existsSync(cacheDir)) return;

  const entries = fs
    .readdirSync(cacheDir)
    .map((name) => ({
      name,
      path: path.join(cacheDir, name),
      stat: fs.statSync(path.join(cacheDir, name)),
    }))
    .filter((e) => e.stat.isDirectory())
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

  // Remove old cache directories
  entries.slice(keepBuilds).forEach((entry) => {
    fs.rmSync(entry.path, { recursive: true, force: true });
  });
}

export function pruneEmptyVistaDirectories(vistaDir: string): void {
  if (!fs.existsSync(vistaDir)) return;

  const prune = (absolutePath: string): boolean => {
    const entries = fs.readdirSync(absolutePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childPath = path.join(absolutePath, entry.name);
      prune(childPath);
    }

    // Never remove the root .vista directory itself.
    if (absolutePath === vistaDir) return false;

    const remaining = fs.readdirSync(absolutePath);
    if (remaining.length === 0) {
      fs.rmdirSync(absolutePath);
      return true;
    }

    return false;
  };

  prune(vistaDir);
}
