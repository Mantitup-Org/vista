/**
 * Vista RSC Web Engine
 *
 * Serves SSR HTML and proxies Flight requests to a dedicated upstream process
 * that runs with `--conditions react-server`.
 *
 * SSR renders Flight streams into HTML using renderToPipeableStream,
 * with a shim __webpack_require__ to resolve client modules during SSR.
 */

import path from 'path';
import fs from 'fs';
import express from 'express';
import React from 'react';
import { renderToString, renderToPipeableStream } from 'react-dom/server';
import webpack from 'webpack';
import webpackDevMiddleware from 'webpack-dev-middleware';
import { Readable, Transform, PassThrough } from 'stream';
import { type ReadableStream as NodeReadableStream } from 'node:stream/web';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { runMiddleware, applyMiddlewareResult } from './middleware-runner';
import { createImageHandler } from './image-optimizer';
import { resolvePprRequestMode } from './ppr';
import { getAllFontHTML as getFontHeadHTML } from '../font/registry';
import { printServerReady, requestLogger, logInfo, logEvent, logError } from './logger';
import { getStyledNotFoundHTML } from './not-found-page';
import {
  getCachedPage,
  loadStaticPagesFromDisk,
  isRevalidating,
  markRevalidating,
  clearRevalidating,
  invalidateCachedPage,
  invalidateCachedPagesByTag,
} from './static-cache';
import { revalidatePath } from './static-generator';
import { normalizeReactServerConsumerManifest } from '../build/rsc/react-client-reference-manifest';
import {
  BUILD_DIR,
  URL_PREFIX,
  STATIC_CHUNKS_PATH,
  SSE_ENDPOINT,
  STRUCTURE_ENDPOINT,
  IMAGE_ENDPOINT,
  HYDRATE_DOCUMENT_FLAG,
} from '../constants';

const CjsModule = require('module');

// ---------------------------------------------------------------------------
// SSR Webpack Shim
// ---------------------------------------------------------------------------
// The Flight SSR decoder (react-server-dom-webpack/client.node) calls
// __webpack_require__(specifier) to load client components during SSR.
// In Vista the SSR process runs in plain Node.js (not through webpack),
// so we provide a shim that converts file:// URLs to absolute paths and
// delegates to Node's require().
// ---------------------------------------------------------------------------

function installSSRWebpackShim(): void {
  if (typeof (globalThis as any).__webpack_require__ === 'function') return;

  (globalThis as any).__webpack_require__ = function ssrWebpackRequire(specifier: string): any {
    let modulePath = specifier;
    // Convert file:// URLs to absolute paths
    if (specifier.startsWith('file://')) {
      try {
        modulePath = fileURLToPath(specifier);
      } catch {
        modulePath = specifier;
      }
    }
    return require(modulePath);
  };

  // Chunk loading is a no-op on the server — all code is already local.
  (globalThis as any).__webpack_chunk_load__ = function ssrChunkLoad(
    _chunkId: string
  ): Promise<void> {
    return Promise.resolve();
  };
}

// ---------------------------------------------------------------------------
// Flight SSR Client types
// ---------------------------------------------------------------------------

type SSRManifest = {
  moduleLoading: { prefix: string; crossOrigin: string | null };
  moduleMap: Record<
    string,
    Record<string, { specifier?: string; id?: string | number; chunks?: string[]; name?: string }>
  >;
  serverModuleMap?: Record<string, any>;
};

type FlightSSRClient = {
  createFromNodeStream: (
    stream: NodeJS.ReadableStream,
    ssrManifest: SSRManifest,
    options?: Record<string, any>
  ) => Thenable<React.ReactNode>;
};

type Thenable<T> = Promise<T> & { status?: string; value?: T };

import {
  resolveCacheComponentsConfig,
  loadConfig,
  resolveAndApplyEngineVariant,
  resolveStructureValidationConfig,
  resolveTypedApiConfig,
} from '../config';
import { ErrorOverlay, renderErrorHTML } from '../dev-error';
import type { RouteEntry, ServerManifest } from '../build/rsc/server-manifest';
import { assertVistaArtifacts } from './artifact-validator';
import { resolveNotFoundComponent, resolveRootLayout, type RootRenderMode } from './root-resolver';
import { resolveRuntimeProjectRoot } from './runtime-artifacts';
import { getErrorMessage, isPermissionDeniedSpawnError } from './spawn-permissions';
import { StructureWatcher, type StructureWatchEvent } from './structure-watch';
import type { StructureValidationResult } from './structure-validator';
import {
  logValidationResult,
  logDevBlocked,
  logDevUnblocked,
  logWatcherStart,
  formatIssuesForOverlay,
} from './structure-log';
import { RouteErrorBoundary } from '../components/error-boundary';
import { RouteSuspense } from '../components/route-suspense';
import {
  resolveLegacyRouteHandlerPath,
  resolveLegacyApiRoutePath,
  runLegacyApiRoute,
  runTypedApiRoute,
} from './typed-api-runtime';
import { installModuleCompileHook } from './module-compile-hook';
import { runWithRequestContext, setCurrentSegmentConfig } from './request-context';
import {
  resolveConventionModule,
  resolveDirectoryChain,
  resolveNearestSegmentNotFoundPath,
  resolveParallelSlotMatches,
} from './app-router-runtime';
import { installSegmentFetchPolicyShim } from './fetch-policy';
import { resolveVistaSourceRequest } from './vista-import-map';
import { createProjectAliasResolver } from './project-alias-resolver';

// Support CSS imports on server runtime
// - Regular .css: ignored (handled by PostCSS)
// - .module.css: return empty class mapping (webpack build handles real mappings)
require.extensions['.css'] = (m: any, filename: string) => {
  if (filename.endsWith('.module.css')) {
    m.exports = {};
  }
};

/**
 * Generate CSS link tags for the document head.
 * Includes the PostCSS globals and CSS Modules extracted stylesheet.
 */
function getCSSLinks(projectRoot?: string): string {
  const root = projectRoot || process.env.VISTA_ARTIFACT_ROOT || process.cwd();
  const links = ['<link rel="stylesheet" href="/styles.css" />'];
  // Check for extracted CSS modules (from MiniCssExtractPlugin)
  const chunksDir = path.join(root, BUILD_DIR, 'static', 'chunks');
  try {
    if (fs.existsSync(chunksDir)) {
      const files = fs.readdirSync(chunksDir).filter((f) => f.endsWith('.css'));
      for (const f of files) {
        links.push(`<link rel="stylesheet" href="${STATIC_CHUNKS_PATH}${f}" />`);
      }
    }
  } catch {
    // Ignore errors during directory scan
  }
  return links.join('\n  ');
}

function parseCliArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function resolvePort(raw: string, fallback: number): number {
  const value = Number(raw || String(fallback));
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }
  return value;
}

function removeStaticArtifacts(vistaDirRoot: string, urlPath: string): void {
  const staticDir = path.join(vistaDirRoot, 'static', 'pages');
  const safePath = urlPath === '/' ? '/index' : urlPath;
  const artifactPaths = ['.html', '.meta.json', '.rsc'].map((extension) =>
    path.join(staticDir, `${safePath}${extension}`)
  );

  for (const absolutePath of artifactPaths) {
    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch {
      // ignore cache cleanup failures
    }
  }
}

function parseRevalidationHeader(rawValue: string | null): string[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function applyUpstreamRevalidations(
  upstream: Response,
  vistaDirRoot: string
): void {
  const revalidatedPaths = parseRevalidationHeader(
    upstream.headers.get('x-vista-revalidated-paths')
  );
  for (const urlPath of revalidatedPaths) {
    invalidateCachedPage(urlPath);
    removeStaticArtifacts(vistaDirRoot, urlPath);
  }

  const revalidatedTags = parseRevalidationHeader(
    upstream.headers.get('x-vista-revalidated-tags')
  );
  for (const tag of revalidatedTags) {
    const affectedPaths = invalidateCachedPagesByTag(tag);
    for (const urlPath of affectedPaths) {
      removeStaticArtifacts(vistaDirRoot, urlPath);
    }
  }
}

function normalizeModuleCachePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

function shouldInvalidateDevModule(modulePath: string, cwd: string): boolean {
  const normalized = normalizeModuleCachePath(modulePath);
  const rootPrefix = normalizeModuleCachePath(`${cwd}${path.sep}`);

  if (!normalized.startsWith(rootPrefix)) return false;
  if (normalized.includes('/node_modules/')) return false;
  if (normalized.includes(`/${BUILD_DIR.toLowerCase()}/`)) return false;

  return /\.(?:[cm]?[jt]sx?|json)$/i.test(normalized);
}

function clearProjectRequireCache(cwd: string): void {
  for (const key of Object.keys(require.cache)) {
    if (!shouldInvalidateDevModule(key, cwd)) continue;
    delete require.cache[key];
  }
}

function resolveFromWorkspace(specifier: string, cwd: string): string {
  const searchRoots = [
    cwd,
    path.resolve(cwd, '..'),
    path.resolve(cwd, '..', '..'),
    path.resolve(cwd, '..', '..', 'rsc'),
    path.resolve(cwd, '..', '..', '..'),
    path.resolve(cwd, '..', '..', '..', 'rsc'),
  ];

  for (const root of searchRoots) {
    try {
      return require.resolve(specifier, { paths: [root] });
    } catch {
      // continue
    }
  }

  return require.resolve(specifier);
}

function setupTypeScriptRuntime(cwd: string): void {
  try {
    const swcRegisterPath = resolveFromWorkspace('@swc-node/register/register', cwd);
    const typescriptPath = resolveFromWorkspace('typescript', cwd);
    const { register } = require(swcRegisterPath) as { register: (options?: Record<string, any>) => void };
    const ts = require(typescriptPath) as typeof import('typescript');
    register({
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      moduleResolution: ts.ModuleResolutionKind.Node16,
      esModuleInterop: true,
      allowJs: true,
    });
    return;
  } catch {
    // fallback
  }

  try {
    const tsNodePath = resolveFromWorkspace('ts-node', cwd);
    require(tsNodePath).register({
      transpileOnly: true,
      compilerOptions: {
        module: 'commonjs',
        jsx: 'react-jsx',
        moduleResolution: 'node16',
        esModuleInterop: true,
        allowJs: true,
      },
    });
    return;
  } catch {
    // fallback
  }

  try {
    const tsxPath = resolveFromWorkspace('tsx/cjs', cwd);
    require(tsxPath);
    return;
  } catch (e) {
    console.log('Failed to setup TypeScript runtime:', e);
    // No TypeScript compiler found
  }
}

let reactResolutionInstalled = false;
let originalResolveFilename: any = null;

function resolveVistaInternalRequest(request: string): string | null {
  return resolveVistaSourceRequest(request, path.resolve(__dirname, '..'));
}

function installSingleReactResolution(cwd: string): void {
  if (reactResolutionInstalled) return;

  let reactPath: string;
  let reactDomPath: string;
  try {
    reactPath = require.resolve('react');
    reactDomPath = require.resolve('react-dom');
  } catch {
    try {
      reactPath = require.resolve('react', { paths: [cwd] });
      reactDomPath = require.resolve('react-dom', { paths: [cwd] });
    } catch {
      return;
    }
  }

  originalResolveFilename = CjsModule._resolveFilename;
  const projectAliasResolver = createProjectAliasResolver(cwd, resolveFromWorkspace);
  CjsModule._resolveFilename = function (
    request: string,
    parent: unknown,
    isMain: boolean,
    options: unknown
  ) {
    const vistaResolvedPath = resolveVistaInternalRequest(request);
    if (vistaResolvedPath) return vistaResolvedPath;
    const aliasResolvedPath = projectAliasResolver?.resolve(request);
    if (aliasResolvedPath) {
      return originalResolveFilename.call(this, aliasResolvedPath, parent, isMain, options);
    }
    if (request === 'react') return reactPath;
    if (request === 'react-dom') return reactDomPath;

    if (request.startsWith('react/')) {
      const subPath = request.slice('react/'.length);
      try {
        return require.resolve(`react/${subPath}`, { paths: [path.dirname(reactPath)] });
      } catch {
        // fall through
      }
    }

    if (request.startsWith('react-dom/')) {
      const subPath = request.slice('react-dom/'.length);
      try {
        return require.resolve(`react-dom/${subPath}`, { paths: [path.dirname(reactDomPath)] });
      } catch {
        // fall through
      }
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  reactResolutionInstalled = true;
}

function withTimeout(url: string, options: RequestInit = {}, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeout))
    .catch((error: unknown) => {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Timed out after ${timeoutMs}ms: ${url}`);
      }
      throw error;
    });
}

function cleanHotUpdateFiles(cwd: string): void {
  const chunksDir = path.join(cwd, BUILD_DIR, 'static', 'chunks');
  if (!fs.existsSync(chunksDir)) return;
  for (const f of fs.readdirSync(chunksDir)) {
    if (f.includes('.hot-update.')) {
      try {
        fs.unlinkSync(path.join(chunksDir, f));
      } catch {}
    }
  }
}

function findChunkFiles(cwd: string, isDev: boolean): string[] {
  const chunksDir = path.join(cwd, BUILD_DIR, 'static', 'chunks');
  if (!fs.existsSync(chunksDir)) return [];

  const files = fs
    .readdirSync(chunksDir)
    .filter(
      (name) => name.endsWith('.js') && !name.endsWith('.map') && !name.includes('.hot-update.')
    );

  // In dev, avoid loading stale production artifacts left from a previous build.
  // Production chunks end with a hash suffix like `main-1a2b3c4d.js`.
  const normalizedFiles = isDev
    ? files.filter((name) => !/-[0-9a-f]{8,}\.js$/i.test(name))
    : files;

  // Load webpack runtime first, then framework, then the rest alphabetically.
  // This ensures the chunk registry (__webpack_require__) is available before
  // any deferred chunk tries to self-register.
  const priority = ['webpack.js', 'framework.js', 'vendor.js'];
  return normalizedFiles.sort((a, b) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

function normalizeSSRManifest(manifest: SSRManifest): SSRManifest {
  if (!manifest || !manifest.moduleMap) {
    return manifest;
  }

  const moduleMap = manifest.moduleMap;
  const aliasEntries: Array<[string, Record<string, any>]> = [];
  const pushAlias = (key: string, exportsMap: Record<string, any>) => {
    if (!key) return;
    aliasEntries.push([key, exportsMap]);

    // React Flight may request module IDs with/without a trailing '#'.
    if (key.endsWith('#')) {
      aliasEntries.push([key.slice(0, -1), exportsMap]);
    } else {
      aliasEntries.push([`${key}#`, exportsMap]);
    }

    // Normalize URI encoding variants for Windows paths with spaces, etc.
    if (key.startsWith('file://')) {
      try {
        const decoded = decodeURI(key);
        if (decoded !== key) {
          aliasEntries.push([decoded, exportsMap]);
          aliasEntries.push([decoded.endsWith('#') ? decoded.slice(0, -1) : `${decoded}#`, exportsMap]);
        }
      } catch {
        // ignore decode failures
      }
      try {
        const encoded = encodeURI(key);
        if (encoded !== key) {
          aliasEntries.push([encoded, exportsMap]);
          aliasEntries.push([encoded.endsWith('#') ? encoded.slice(0, -1) : `${encoded}#`, exportsMap]);
        }
      } catch {
        // ignore encode failures
      }
    }
  };

  for (const [moduleKey, exportsMap] of Object.entries(moduleMap)) {
    const normalizedExports: Record<string, { id: string; chunks: string[]; name: string }> = {};

    for (const [exportName, rawEntry] of Object.entries(exportsMap || {})) {
      const entry = rawEntry || {};
      const normalizedId = String(entry.id ?? entry.specifier ?? moduleKey);
      normalizedExports[exportName] = {
        id: normalizedId,
        chunks: Array.isArray(entry.chunks) ? entry.chunks : [],
        name: entry.name || exportName,
      };
    }

    moduleMap[moduleKey] = normalizedExports as any;
    pushAlias(moduleKey, normalizedExports);

    for (const normalizedEntry of Object.values(normalizedExports)) {
      const aliasKey = String(normalizedEntry.id);
      pushAlias(aliasKey, normalizedExports);
    }
  }

  for (const [aliasKey, exportsMap] of aliasEntries) {
    if (!moduleMap[aliasKey]) {
      moduleMap[aliasKey] = exportsMap as any;
    }
  }

  return manifest;
}

function loadSSRManifestFromDisk(absolutePath: string): SSRManifest {
  const manifest = normalizeReactServerConsumerManifest(
    JSON.parse(fs.readFileSync(absolutePath, 'utf-8')) as SSRManifest
  ) as SSRManifest;
  return normalizeSSRManifest(manifest);
}

function matchPattern(pathname: string, pattern: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length === 0 && pathParts.length === 0) return true;

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    // Optional catch-all: matches zero or more segments
    if (patternPart.endsWith('*?')) {
      return true; // matches even with zero remaining segments
    }

    // Required catch-all: matches one or more remaining segments
    if (patternPart.endsWith('*')) {
      return pathParts.length >= i + 1;
    }

    if (patternPart.startsWith(':')) {
      if (!pathPart) return false;
      continue;
    }
    if (patternPart !== pathPart) return false;
  }

  return patternParts.length === pathParts.length;
}

function matchRoute(pathname: string, routes: RouteEntry[]): RouteEntry | null {
  // Sort routes: more specific patterns first, optional catch-all last
  const sorted = [...routes].sort((a, b) => {
    const aOptional = a.pattern.includes('*?');
    const bOptional = b.pattern.includes('*?');
    if (aOptional && !bOptional) return 1;
    if (!aOptional && bOptional) return -1;
    // More segments = more specific
    return b.pattern.split('/').length - a.pattern.split('/').length;
  });

  for (const route of sorted) {
    if (matchPattern(pathname, route.pattern)) return route;
  }
  return null;
}

function extractParams(pathname: string, route: RouteEntry): Record<string, string> {
  const params: Record<string, string> = {};
  const patternParts = route.pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    if (!patternPart.startsWith(':')) continue;

    const name = patternPart.slice(1).replace(/\*\??/, '');
    if (patternPart.endsWith('*?') || patternPart.endsWith('*')) {
      params[name] = pathParts.slice(i).join('/');
    } else {
      params[name] = pathParts[i] || '';
    }
  }

  return params;
}

async function createRenderableRouteModuleElement(
  modulePath: string,
  context: {
    params: Record<string, string>;
    searchParams: Record<string, string>;
    req: express.Request;
  },
  options: {
    evaluateMetadata?: boolean;
  } = {}
): Promise<React.ReactElement> {
  const { params, searchParams, req } = context;
  const RouteModule = require(modulePath);
  const RouteComponent = RouteModule.default;
  if (!RouteComponent) {
    throw new Error(`Route module does not export default component: ${modulePath}`);
  }

  if (options.evaluateMetadata && typeof RouteModule.generateMetadata === 'function') {
    await RouteModule.generateMetadata({ params, searchParams }, RouteModule.metadata ?? {});
  }

  const routeProps =
    typeof RouteModule.getServerProps === 'function'
      ? await RouteModule.getServerProps({ query: req.query, params, req })
      : {};

  const moduleStem = path.basename(modulePath).replace(/\.[jt]sx?$/, '');
  if (moduleStem === 'default' || moduleStem === 'not-found') {
    const eagerResult = await RouteComponent({
      ...routeProps,
      params,
      searchParams,
    });
    return React.isValidElement(eagerResult)
      ? (eagerResult as React.ReactElement)
      : (React.createElement(React.Fragment, null, eagerResult) as React.ReactElement);
  }

  return React.createElement(RouteComponent, {
    ...routeProps,
    params,
    searchParams,
  }) as React.ReactElement;
}

function applySegmentBoundaries(dir: string, element: React.ReactElement): React.ReactElement {
  const loadingPath = resolveConventionModule(dir, 'loading');
  const errorPath = resolveConventionModule(dir, 'error');

  const loadingComponent = loadingPath
    ? (() => {
        try {
          return require(loadingPath).default;
        } catch {
          return undefined;
        }
      })()
    : undefined;
  const errorComponent = errorPath
    ? (() => {
        try {
          return require(errorPath).default;
        } catch {
          return undefined;
        }
      })()
    : undefined;

  let wrappedElement = element;

  if (loadingComponent) {
    wrappedElement = React.createElement(RouteSuspense, {
      loadingComponent,
      children: wrappedElement,
    } as any) as React.ReactElement;
  }

  if (errorComponent) {
    wrappedElement = React.createElement(RouteErrorBoundary, {
      fallbackComponent: errorComponent,
      children: wrappedElement,
    } as any) as React.ReactElement;
  }

  return wrappedElement;
}

async function renderAppSubtreeElement(input: {
  subtreeRootDir: string;
  entryFilePath: string;
  pathname: string;
  params: Record<string, string>;
  searchParams: Record<string, string>;
  req: express.Request;
  cwd: string;
  evaluateLeafMetadata?: boolean;
  disableParallelSlots?: boolean;
}): Promise<React.ReactElement> {
  const appDir = path.join(input.cwd, 'app');
  let element = await createRenderableRouteModuleElement(
    input.entryFilePath,
    {
      params: input.params,
      searchParams: input.searchParams,
      req: input.req,
    },
    {
      evaluateMetadata: input.evaluateLeafMetadata,
    }
  );

  const directoryChain = resolveDirectoryChain(input.subtreeRootDir, input.entryFilePath);

  for (let i = directoryChain.length - 1; i >= 0; i--) {
    const dir = directoryChain[i];
    element = applySegmentBoundaries(dir, element);

    const layoutPath =
      resolveConventionModule(dir, 'root') ?? resolveConventionModule(dir, 'layout');
    if (!layoutPath || path.resolve(layoutPath) === path.resolve(input.entryFilePath)) {
      continue;
    }

    const LayoutModule = require(layoutPath);
    const LayoutComponent = LayoutModule.default;
    if (!LayoutComponent) {
      continue;
    }

    const slotProps: Record<string, React.ReactNode> = {};
    if (!input.disableParallelSlots) {
      const slotMatches = resolveParallelSlotMatches({
        appDir,
        layoutPath,
        pathname: input.pathname,
      });

      for (const slotMatch of slotMatches) {
        slotProps[slotMatch.slotName] = await renderAppSubtreeElement({
          subtreeRootDir: slotMatch.slotRootDir,
          entryFilePath: slotMatch.filePath,
          pathname: input.pathname,
          params: {
            ...input.params,
            ...slotMatch.params,
          },
          searchParams: input.searchParams,
          req: input.req,
          cwd: input.cwd,
          evaluateLeafMetadata: true,
        });
      }
    }

    element = React.createElement(
      LayoutComponent,
      {
        params: input.params,
        searchParams: input.searchParams,
        ...slotProps,
      },
      element
    ) as React.ReactElement;
  }

  return element;
}

async function createRouteElement(
  route: RouteEntry,
  context: {
    params: Record<string, string>;
    searchParams: Record<string, string>;
    req: express.Request;
  },
  isDev: boolean,
  rootLayout: ReturnType<typeof resolveRootLayout>,
  runtimeRoot: string,
  options: {
    disableParallelSlots?: boolean;
  } = {}
): Promise<{ element: React.ReactElement; metadata: any; rootMode: RootRenderMode }> {
  const { params, searchParams, req } = context;

  if (isDev) {
    clearProjectRequireCache(runtimeRoot);
  }

  const PageModule = require(route.pagePath);
  let metadata: any = { ...(rootLayout.metadata || {}) };
  if (PageModule.metadata) {
    metadata = { ...metadata, ...PageModule.metadata };
  }
  if (typeof PageModule.generateMetadata === 'function') {
    const dynamicMeta = await PageModule.generateMetadata({ params, searchParams }, metadata);
    metadata = { ...metadata, ...dynamicMeta };
  }

  const element = await renderAppSubtreeElement({
    subtreeRootDir: path.join(runtimeRoot, 'app'),
    entryFilePath: route.pagePath,
    pathname: req.path,
    params,
    searchParams,
    req,
    cwd: runtimeRoot,
    evaluateLeafMetadata: false,
    disableParallelSlots: options.disableParallelSlots,
  });

  return { element, metadata, rootMode: rootLayout.mode };
}

function injectBeforeClosingTag(html: string, tagName: string, injection: string): string {
  const closeTag = `</${tagName}>`;
  if (html.includes(closeTag)) {
    return html.replace(closeTag, `${injection}\n${closeTag}`);
  }
  return html;
}

function createHtmlDocument(
  appHtml: string,
  metadataHtml: string,
  chunkFiles: string[],
  rootMode: RootRenderMode = 'legacy'
): string {
  const scripts = chunkFiles
    .map((chunk) => `<script defer src="${STATIC_CHUNKS_PATH}${chunk}"></script>`)
    .join('\n  ');

  if (
    rootMode === 'document' ||
    /^\s*<!doctype html>\s*<html/i.test(appHtml) ||
    /^\s*<html/i.test(appHtml)
  ) {
    const fontHtml = getFontHeadHTML();
    const headInjection = `\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  ${metadataHtml}\n  ${fontHtml}\n  ${getCSSLinks()}`;
    const bodyInjection = `\n  <script>window.${HYDRATE_DOCUMENT_FLAG} = true;</script>\n  ${scripts}`;

    let html = appHtml;
    if (!/^\s*<!doctype html>/i.test(html)) {
      html = `<!DOCTYPE html>\n${html}`;
    }
    html = injectBeforeClosingTag(html, 'head', headInjection);
    html = injectBeforeClosingTag(html, 'body', bodyInjection);
    return html;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden}</style>
  ${metadataHtml}
  ${getFontHeadHTML()}
  ${getCSSLinks()}
</head>
<body>
  <script>window.${HYDRATE_DOCUMENT_FLAG} = false;</script>
  <div id="root">${appHtml}</div>
  ${scripts}
</body>
</html>`;
}

function appendVaryHeader(existing: unknown, nextValue: string): string {
  const values = String(existing || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!values.includes(nextValue)) {
    values.push(nextValue);
  }

  return values.join(', ');
}

async function handleApiRoute(
  req: express.Request,
  res: express.Response,
  runtimeRoot: string,
  isDev: boolean,
  typedApiConfig: ReturnType<typeof resolveTypedApiConfig>
): Promise<void> {
  try {
    const legacyApiPath = resolveLegacyApiRoutePath(runtimeRoot, req.path);
    if (legacyApiPath) {
      await runLegacyApiRoute({
        req,
        res,
        apiPath: legacyApiPath,
        isDev,
      });
      return;
    }

    const typedHandled = await runTypedApiRoute({
      req,
      res,
      cwd: runtimeRoot,
      isDev,
      config: typedApiConfig,
    });
    if (typedHandled) {
      return;
    }

    res.status(404).json({ error: 'API Route Not Found' });
  } catch (error) {
    console.error('[vista:rsc] API route error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

function spawnUpstream(
  cwd: string,
  runtimeRoot: string,
  upstreamPort: number
) {
  const upstreamScript = path.join(__dirname, 'rsc-upstream.js');
  try {
    return {
      child: spawn(
        process.execPath,
        ['--conditions', 'react-server', upstreamScript, '--port', String(upstreamPort)],
        {
          cwd,
          env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV || 'development',
            RSC_UPSTREAM_PORT: String(upstreamPort),
            VISTA_ARTIFACT_ROOT: cwd,
            VISTA_RUNTIME_ROOT: runtimeRoot,
          },
          stdio: 'pipe',
        }
      ),
      unavailableReason: null as string | null,
    };
  } catch (error) {
    if (isPermissionDeniedSpawnError(error)) {
      return {
        child: null,
        unavailableReason: `spawn blocked by environment permissions (${getErrorMessage(error)})`,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Flight-Based SSR Rendering Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the Flight stream from the upstream RSC process, decode it with
 * createFromNodeStream, and render the resulting React tree to an HTML stream
 * via renderToPipeableStream.
 */
async function renderFlightToHTMLStream(
  upstreamOrigin: string,
  pathname: string,
  search: string,
  metadataHtml: string,
  chunkFiles: string[],
  rootMode: RootRenderMode,
  flightSSRClient: FlightSSRClient,
  ssrManifest: SSRManifest,
  res: express.Response,
  isDev: boolean
): Promise<void> {
  const flightUrl = `${upstreamOrigin}/rsc${pathname}${search ? `?${search}` : ''}`;

  // 1. Fetch Flight stream from upstream
  const upstream = await withTimeout(
    flightUrl,
    {
      headers: { Accept: 'text/x-component' },
    },
    5000
  );

  if (!upstream.ok && upstream.status !== 404) {
    throw new Error(`Upstream returned ${upstream.status}: ${await upstream.text()}`);
  }

  if (!upstream.body) {
    throw new Error('Upstream returned empty body');
  }

  // 2. Convert Web ReadableStream to Node.js Readable
  const nodeStream = Readable.fromWeb(upstream.body as unknown as NodeReadableStream);

  // 3. Decode Flight stream into a React tree
  const flightResponse = flightSSRClient.createFromNodeStream(nodeStream, ssrManifest);
  let element: React.ReactElement;

  // In dev, decode the flight payload before React.use() render path.
  // This keeps manifest mismatch errors in the request try/catch boundary
  // instead of crashing the whole process with an uncaught exception.
  if (isDev) {
    const resolvedTree = await (flightResponse as Promise<React.ReactNode>);
    element = React.createElement(React.Fragment, null, resolvedTree);
  } else {
    // 4. Wrap in a component that consumes the Flight response
    function FlightRoot() {
      return React.use(flightResponse as Promise<React.ReactNode>);
    }

    element = React.createElement(FlightRoot);
  }

  // 5. Build script tags for client chunks
  const scripts = chunkFiles
    .map((chunk) => `<script defer src="${STATIC_CHUNKS_PATH}${chunk}"></script>`)
    .join('\n  ');

  // 6. Render to a pipeable HTML stream
  return new Promise<void>((resolve, reject) => {
    let shellSent = false;

    const { pipe } = renderToPipeableStream(element, {
      onShellReady() {
        shellSent = true;
        res.status(upstream.status === 404 ? 404 : 200);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Create a transform stream to inject head/body content
        const transform = new Transform({
          transform(chunk, _encoding, callback) {
            let html = chunk.toString();

            // Inject into <head> if present
            if (html.includes('</head>')) {
              const fontHtml = getFontHeadHTML();
              const headInjection = `
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${metadataHtml}
  ${fontHtml}
  ${getCSSLinks()}`;
              html = html.replace('</head>', `${headInjection}\n</head>`);
            }

            // Inject scripts before </body>
            if (html.includes('</body>')) {
              const bodyInjection = `
  <script>window.${HYDRATE_DOCUMENT_FLAG} = ${rootMode === 'document'};</script>
  ${scripts}`;
              html = html.replace('</body>', `${bodyInjection}\n</body>`);
            }

            callback(null, html);
          },
        });

        pipe(transform);
        transform.pipe(res);
      },

      onShellError(error) {
        if (!shellSent) {
          reject(error);
        }
      },

      onError(error) {
        if (isDev) {
          console.error('[vista:rsc] Flight SSR stream error:', error);
        }
      },

      onAllReady() {
        resolve();
      },
    });
  });
}

/**
 * Wraps content in a document shell when the root layout doesn't provide one.
 * Used as fallback when the Flight stream doesn't include <html>/<head>/<body>.
 */
function wrapInDocumentShell(
  bodyContent: string,
  metadataHtml: string,
  chunkFiles: string[],
  rootMode: RootRenderMode
): string {
  const scripts = chunkFiles
    .map((chunk) => `<script defer src="${STATIC_CHUNKS_PATH}${chunk}"></script>`)
    .join('\n  ');

  if (
    rootMode === 'document' ||
    /^\s*<!doctype html>\s*<html/i.test(bodyContent) ||
    /^\s*<html/i.test(bodyContent)
  ) {
    const fontHtml = getFontHeadHTML();
    const headInjection = `\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  ${metadataHtml}\n  ${fontHtml}\n  ${getCSSLinks()}`;
    const bodyInjection = `\n  <script>window.${HYDRATE_DOCUMENT_FLAG} = true;</script>\n  ${scripts}`;

    let html = bodyContent;
    if (!/^\s*<!doctype html>/i.test(html)) {
      html = `<!DOCTYPE html>\n${html}`;
    }
    html = injectBeforeClosingTag(html, 'head', headInjection);
    html = injectBeforeClosingTag(html, 'body', bodyInjection);
    return html;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden}</style>
  ${metadataHtml}
  ${getFontHeadHTML()}
  ${getCSSLinks()}
</head>
<body>
  <script>window.${HYDRATE_DOCUMENT_FLAG} = false;</script>
  <div id="root">${bodyContent}</div>
  ${scripts}
</body>
</html>`;
}

type ClientCompileState = 'ready' | 'compiling' | 'error';

function normalizeWebpackErrors(stats: webpack.Stats): string[] {
  const errors = stats.toJson().errors || [];
  const normalizedErrors = errors
    .map((entry: any) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry.message === 'string') return entry.message;
      return String(entry || '');
    })
    .filter((entry: string) => entry.trim().length > 0);

  if (normalizedErrors.length > 0) {
    return normalizedErrors;
  }

  return ['Unknown build error.'];
}

function renderCompilePendingHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Compiling...</title>
  <style>
    html,body{height:100%;margin:0}
    body{
      display:grid;
      place-items:center;
      font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
      background:#09090b;
      color:#f4f4f5;
    }
    .vista-dev-pending{
      padding:20px 24px;
      border-radius:14px;
      border:1px solid rgba(255,255,255,0.15);
      background:rgba(17,17,20,0.92);
      box-shadow:0 18px 42px rgba(0,0,0,0.4);
      font-size:14px;
      letter-spacing:0.01em;
    }
  </style>
</head>
<body>
  <div class="vista-dev-pending">Vista is compiling the client bundle. Retrying...</div>
  <script>setTimeout(function(){window.location.reload();},700);</script>
</body>
</html>`;
}

export interface RSCEngineOptions {
  port?: number;
  compiler?: webpack.Compiler | null;
  projectRoot?: string;
  runtimeRoot?: string;
}

export function startRSCServer(options: RSCEngineOptions = {}): void {
  const app = express();
  const cwd = path.resolve(options.projectRoot || process.env.VISTA_ARTIFACT_ROOT || process.cwd());
  const runtimeRoot = resolveRuntimeProjectRoot(cwd, options.runtimeRoot);
  const isDev = process.env.NODE_ENV !== 'production';
  const vistaConfig = loadConfig(runtimeRoot);
  const cacheComponentsConfig = resolveCacheComponentsConfig(vistaConfig);
  const engineVariant = resolveAndApplyEngineVariant(vistaConfig);
  const typedApiConfig = resolveTypedApiConfig(vistaConfig);
  if (process.env.VISTA_DEBUG) {
    logInfo(`Engine variant: ${engineVariant}`);
  }

  // Clean stale hot-update files from previous runs
  cleanHotUpdateFiles(cwd);

  // Request logger — logs GET/POST with timing
  app.use(requestLogger());

  const port = resolvePort(String(options.port || vistaConfig.server?.port || 3003), 3003);
  const upstreamPort = resolvePort(String(process.env.RSC_UPSTREAM_PORT || port + 1), port + 1);
  const upstreamOrigin = `http://127.0.0.1:${upstreamPort}`;

  installSingleReactResolution(runtimeRoot);
  setupTypeScriptRuntime(runtimeRoot);
  installModuleCompileHook({
    cwd: runtimeRoot,
    cacheComponentsEnabled: cacheComponentsConfig.enabled,
  });
  installSegmentFetchPolicyShim();
  installSSRWebpackShim();

  const serverManifestPath = path.join(cwd, BUILD_DIR, 'server', 'server-manifest.json');
  if (!fs.existsSync(serverManifestPath)) {
    console.error(
      `[vista:rsc] Missing server manifest at ${serverManifestPath}. Run "vista build --rsc" first.`
    );
    process.exit(1);
  }
  try {
    if (!isDev || !options.compiler) {
      assertVistaArtifacts(cwd, 'rsc');
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }

  // ========================================================================
  // Flight SSR Client + SSR Manifest
  // ========================================================================
  let flightSSRClient: FlightSSRClient | null = null;
  let ssrManifest: SSRManifest | null = null;

  try {
    const flightClientPath = resolveFromWorkspace('react-server-dom-webpack/client.node', cwd);
    flightSSRClient = require(flightClientPath) as FlightSSRClient;
  } catch (err) {
    // Flight SSR not available — fallback to renderToString
  }

  const ssrManifestPath = path.join(cwd, BUILD_DIR, 'react-server-manifest.json');
  const ssrManifestLegacyPath = path.join(cwd, BUILD_DIR, 'react-ssr-manifest.json');
  const resolvedSSRManifestPath = fs.existsSync(ssrManifestPath)
    ? ssrManifestPath
    : fs.existsSync(ssrManifestLegacyPath)
      ? ssrManifestLegacyPath
      : null;

  if (resolvedSSRManifestPath) {
    ssrManifest = loadSSRManifestFromDisk(resolvedSSRManifestPath);
  } else if (flightSSRClient) {
    // Can't use Flight SSR without the manifest
    flightSSRClient = null;
  }

  const useFlightSSR = !!flightSSRClient && !!ssrManifest;

  // ========================================================================
  // Structure Validation (dev + strict-block)
  // ========================================================================
  const structureConfig = resolveStructureValidationConfig(vistaConfig);
  let currentStructureState: StructureValidationResult | null = null;
  let structureWatcher: StructureWatcher | null = null;

  if (structureConfig.enabled) {
    const { validateAppStructure } = require('./structure-validator');
    const initialResult = validateAppStructure({ cwd }) as StructureValidationResult;
    currentStructureState = initialResult;
    logValidationResult(initialResult, structureConfig.logLevel);

    if (initialResult.state === 'error' && structureConfig.mode === 'strict') {
      logDevBlocked();
    }
  }

  let serverManifest = JSON.parse(fs.readFileSync(serverManifestPath, 'utf-8')) as ServerManifest;

  // ========================================================================
  // Load pre-rendered static pages from disk into in-memory cache (production)
  // ========================================================================
  const vistaDirRoot = path.join(cwd, BUILD_DIR);
  if (!isDev) {
    const loadedStaticPages = loadStaticPagesFromDisk(vistaDirRoot);
    if (loadedStaticPages > 0) {
      logInfo(`Loaded ${loadedStaticPages} pre-rendered page(s) from cache`);
    }
  }

  let upstreamStderr = '';
  const upstreamLaunch = spawnUpstream(cwd, runtimeRoot, upstreamPort);
  const upstreamChild = upstreamLaunch.child as ChildProcessWithoutNullStreams | null;
  let upstreamUnavailableReason = upstreamLaunch.unavailableReason;

  if (upstreamChild) {
    upstreamChild.stdout.setEncoding('utf8');
    upstreamChild.stderr.setEncoding('utf8');
    // Always capture stderr so we can log crash reasons
    if (process.env.VISTA_DEBUG) {
      upstreamChild.stdout.on('data', (chunk: string) => process.stdout.write(chunk));
      upstreamChild.stderr.on('data', (chunk: string) => {
        upstreamStderr += chunk;
        process.stderr.write(chunk);
      });
    } else {
      upstreamChild.stdout.on('data', () => {}); // drain
      upstreamChild.stderr.on('data', (chunk: string) => {
        upstreamStderr += chunk;
      });
    }
    upstreamChild.on('exit', (code, signal) => {
      if (code !== 0 || (code === null && !shutdownCalled)) {
        upstreamUnavailableReason = `process exited unexpectedly (code=${code ?? 'unknown'}, signal=${signal ?? 'null'})`;
        logError(`Upstream exited unexpectedly (code=${code}, signal=${signal ?? 'null'})`);
        if (upstreamStderr.trim()) {
          logError(`Upstream stderr:\n${upstreamStderr.trim()}`);
        }
      }
    });
  } else if (upstreamUnavailableReason) {
    logError(`[vista:rsc] ${upstreamUnavailableReason}`);
  }

  // Graceful shutdown — populated after all resources are created
  let shutdownCalled = false;
  let httpServer: ReturnType<typeof app.listen> | null = null;
  let fsWatcher: { close: () => void | Promise<void> } | null = null;

  const shutdown = () => {
    if (shutdownCalled) return;
    shutdownCalled = true;

    // 1. Kill upstream RSC child
    if (upstreamChild && !upstreamChild.killed) {
      upstreamChild.kill('SIGTERM');
      setTimeout(() => {
        if (!upstreamChild.killed) upstreamChild.kill('SIGKILL');
      }, 800);
    }

    // 2. Close fs watcher
    if (fsWatcher) {
      try {
        fsWatcher.close();
      } catch {}
    }

    // 3. End all SSE connections
    sseReloadClients.forEach((c) => {
      try {
        c.end();
      } catch {}
    });
    sseReloadClients.clear();

    // 4. Stop structure watcher
    if (structureWatcher) {
      try {
        structureWatcher.stop();
      } catch {}
    }

    // 5. Close HTTP server
    if (httpServer) {
      httpServer.close();
    }

    // 6. Force exit after brief grace period (Windows Ctrl+C fix)
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', shutdown);

  // ========================================================================
  // Live-Reload SSE for RSC dev mode
  // - Pushes reload events when server components change (fs.watch)
  // - Pushes compile errors/success from webpack client build
  // ========================================================================
  const sseReloadClients: Set<express.Response> = new Set();
  let clientCompileState: ClientCompileState = isDev && options.compiler ? 'compiling' : 'ready';
  let clientCompileErrors: string[] = [];

  if (isDev) {
    app.get(SSE_ENDPOINT, (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      sseReloadClients.add(res);
      res.write('data: connected\n\n');
      req.on('close', () => {
        sseReloadClients.delete(res);
      });
    });

    const pushSSE = (payload: string) => {
      sseReloadClients.forEach((c) => c.write(`data: ${payload}\n\n`));
    };

    const watchExtPattern = /\.(?:[cm]?[jt]sx?|css|md|mdx|json)$/i;
    const watchRoots = [
      'app',
      'components',
      'content',
      'lib',
      'ctx',
      'data',
      'middleware.ts',
      'vista.config.ts',
      'content-collections.ts',
    ]
      .map((entry) => path.join(cwd, entry))
      .filter((entry) => fs.existsSync(entry));

    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        logEvent('Source changed, reloading...');
        pushSSE('reload');
      }, 70);
    };

    try {
      const chokidar = require('chokidar');
      const watcher = chokidar.watch(watchRoots, {
        ignoreInitial: true,
        ignored: (watchedPath: string) =>
          watchedPath.includes(`${path.sep}node_modules${path.sep}`) ||
          watchedPath.includes(`${path.sep}.git${path.sep}`) ||
          watchedPath.includes(`${path.sep}${BUILD_DIR}${path.sep}`),
      });

      watcher.on('all', (_event: string, filePath: string) => {
        if (filePath && watchExtPattern.test(filePath)) {
          scheduleReload();
        }
      });

      fsWatcher = watcher;
    } catch {
      const nativeWatchers: fs.FSWatcher[] = [];
      const onChange = (_event: string, filePath?: string) => {
        if (filePath && watchExtPattern.test(filePath)) {
          scheduleReload();
        }
      };

      for (const watchPath of watchRoots) {
        try {
          const stat = fs.statSync(watchPath);
          if (stat.isDirectory()) {
            nativeWatchers.push(fs.watch(watchPath, { recursive: true }, onChange));
          } else {
            nativeWatchers.push(fs.watch(watchPath, onChange));
          }
        } catch {
          // Skip missing or unsupported watch path.
        }
      }

      fsWatcher = {
        close: () => {
          nativeWatchers.forEach((watcher) => watcher.close());
        },
      };
    }
  }

  if (isDev && options.compiler) {
    app.use(
      webpackDevMiddleware(options.compiler, {
        publicPath: STATIC_CHUNKS_PATH,
        stats: 'none',
        writeToDisk: true,
      })
    );

    // No webpack-hot-middleware — Vista uses SSE live-reload for RSC

    options.compiler.hooks.invalid.tap('VistaRSCCompileStateInvalid', () => {
      clientCompileState = 'compiling';
      clientCompileErrors = [];
    });

    // Push compile errors/success to SSE clients
    options.compiler.hooks.done.tap('VistaRSCLiveReload', (stats) => {
      if (stats.hasErrors()) {
        const normalizedErrors = normalizeWebpackErrors(stats);
        const fallback = normalizedErrors.join('\n\n');
        clientCompileState = 'error';
        clientCompileErrors = normalizedErrors;
        const payload = JSON.stringify({
          type: 'error',
          message: fallback,
          errors: normalizedErrors,
        });
        sseReloadClients.forEach((c) => c.write(`data: ${payload}\n\n`));
      } else {
        clientCompileState = 'ready';
        clientCompileErrors = [];
        const payload = JSON.stringify({ type: 'ok' });
        sseReloadClients.forEach((c) => c.write(`data: ${payload}\n\n`));
      }
    });

    options.compiler.hooks.afterEmit.tap('VistaRSCServerManifestReload', () => {
      if (fs.existsSync(serverManifestPath)) {
        serverManifest = JSON.parse(fs.readFileSync(serverManifestPath, 'utf-8')) as ServerManifest;
      }
      // Reload SSR manifest on rebuild too
      if (resolvedSSRManifestPath && fs.existsSync(resolvedSSRManifestPath)) {
        ssrManifest = loadSSRManifestFromDisk(resolvedSSRManifestPath);
      }
    });
  }

  // ========================================================================
  // Structure Watcher SSE (RSC dev mode)
  // ========================================================================
  const sseStructureClients: Set<express.Response> = new Set();

  app.get(STRUCTURE_ENDPOINT, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseStructureClients.add(res);
    res.write('data: connected\n\n');
    req.on('close', () => {
      sseStructureClients.delete(res);
    });
  });

  if (isDev && structureConfig.enabled) {
    structureWatcher = new StructureWatcher({
      cwd,
      debounceMs: structureConfig.watchDebounceMs,
    });

    structureWatcher.on('validation', (event: StructureWatchEvent) => {
      logValidationResult(
        { state: event.state, issues: event.issues, routeGraph: [], timestamp: event.timestamp },
        structureConfig.logLevel
      );
    });

    structureWatcher.on('structure-error', (event: StructureWatchEvent) => {
      if (structureConfig.mode === 'strict') {
        logDevBlocked();
        currentStructureState = {
          state: 'error',
          issues: event.issues,
          routeGraph: [],
          timestamp: event.timestamp,
        };
        const overlayMsg = formatIssuesForOverlay(
          currentStructureState,
          structureConfig.includeWarningsInOverlay
        );
        const data = JSON.stringify({ type: 'structure-error', message: overlayMsg });
        sseStructureClients.forEach((c) => c.write(`data: ${data}\n\n`));
      }
    });

    structureWatcher.on('structure-ok', (event: StructureWatchEvent) => {
      const wasBlocked =
        currentStructureState?.state === 'error' && structureConfig.mode === 'strict';
      currentStructureState = {
        state: 'ok',
        issues: event.issues,
        routeGraph: [],
        timestamp: event.timestamp,
      };
      if (wasBlocked) {
        logDevUnblocked();
        const data = JSON.stringify({ type: 'structure-ok' });
        sseStructureClients.forEach((c) => c.write(`data: ${data}\n\n`));
      }
    });

    logWatcherStart();
    structureWatcher.start().catch((err) => {
      console.error('[vista:validate] Failed to start structure watcher:', err);
    });
  }

  app.get('/styles.css', (req, res) => {
    const cssPath = path.join(cwd, BUILD_DIR, 'client.css');
    if (fs.existsSync(cssPath)) {
      res.setHeader('Content-Type', 'text/css');
      res.sendFile(cssPath);
      return;
    }
    res.status(404).type('text/css').send('/* CSS not found */');
  });

  // Image optimization endpoint
  const imageHandler = createImageHandler(runtimeRoot, isDev);
  app.get(IMAGE_ENDPOINT, imageHandler);

  app.use(express.static(path.join(runtimeRoot, 'public')));
  app.use(`${URL_PREFIX}/static`, express.static(path.join(cwd, BUILD_DIR, 'static')));
  app.use(URL_PREFIX, express.static(path.join(cwd, BUILD_DIR)));
  app.use(express.static(path.join(cwd, BUILD_DIR)));

  const getUpstreamUnavailableMessage = () =>
    `RSC upstream unavailable (${upstreamOrigin}/rsc): ${
      upstreamUnavailableReason || 'upstream process is not running'
    }`;

  const proxyRSCRequest = async (req: express.Request, res: express.Response) => {
    if (isDev && options.compiler) {
      if (clientCompileState === 'compiling') {
        res.status(503).type('text/plain').send('[vista] Client bundle is compiling. Retry shortly.');
        return;
      }
      if (clientCompileState === 'error') {
        res.status(500).type('text/plain').send(clientCompileErrors.join('\n\n'));
        return;
      }
    }

    if (upstreamUnavailableReason) {
      res.status(503).type('text/plain').send(getUpstreamUnavailableMessage());
      return;
    }

    try {
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: { Accept: req.get('Accept') ?? 'text/x-component' },
      };

      // Forward Server Action headers and body for POST requests
      if (req.method === 'POST') {
        const rscAction = req.headers['rsc-action'] as string | undefined;
        if (rscAction) {
          (fetchOptions.headers as Record<string, string>)['rsc-action'] = rscAction;
        }

        const contentType = req.get('content-type');
        if (contentType) {
          (fetchOptions.headers as Record<string, string>)['content-type'] = contentType;
        }

        // Collect the raw body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        fetchOptions.body = Buffer.concat(chunks);
      }

      const upstream = await withTimeout(`${upstreamOrigin}${req.originalUrl}`, fetchOptions);
      applyUpstreamRevalidations(upstream, vistaDirRoot);

      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      res.setHeader('Vary', 'Accept');

      if (!upstream.body) {
        res.end(await upstream.text());
        return;
      }

      Readable.fromWeb(upstream.body as unknown as NodeReadableStream).pipe(res);
    } catch (error) {
      res.status(503).type('text/plain').send(getUpstreamUnavailableMessage());
    }
  };

  app.get('/rsc*', proxyRSCRequest);
  app.get('/_rsc*', proxyRSCRequest);
  app.post('/rsc*', proxyRSCRequest);
  app.post('/_rsc*', proxyRSCRequest);

  // -------------------------------------------------------------------
  // User middleware (middleware.ts at project root)
  // -------------------------------------------------------------------
  app.use(async (req, res, next) => {
    // Skip internal paths — middleware should only run on page/API requests
    if (
      req.path === '/styles.css' ||
      req.path.startsWith('/_vista') ||
      req.path.startsWith('/__webpack_hmr') ||
      req.path.startsWith('/__vista_structure') ||
      req.path.startsWith('/rsc') ||
      req.path.startsWith('/_rsc')
    ) {
      return next();
    }

    const result = await runMiddleware(req, runtimeRoot, isDev);
    const finalized = applyMiddlewareResult(result, req, res);
    if (finalized) return; // response already sent (redirect / short-circuit)
    next();
  });

  app.use(async (req, res, next) => {
    if (
      req.path === '/styles.css' ||
      req.path.startsWith('/_vista') ||
      req.path.startsWith('/__webpack_hmr') ||
      req.path.startsWith('/__vista_structure') ||
      req.path.startsWith('/rsc') ||
      req.path.startsWith('/_rsc')
    ) {
      return next();
    }

    await runWithRequestContext(
      {
        req,
        res,
        cwd: runtimeRoot,
        vistaDirRoot,
        urlPath: req.path,
      },
      async () => {

    // ======================================================================
    // Structure validation gate (strict-block in dev)
    // ======================================================================
    if (
      isDev &&
      structureConfig.enabled &&
      structureConfig.mode === 'strict' &&
      currentStructureState?.state === 'error'
    ) {
      const overlayMessage = formatIssuesForOverlay(
        currentStructureState,
        structureConfig.includeWarningsInOverlay
      );
      const errorInfo = {
        type: 'build' as const,
        message: `Structure Validation Failed\n\n${overlayMessage}`,
      };
      res
        .status(500)
        .type('text/html')
        .send(renderErrorHTML([errorInfo]));
      return;
    }

    if (isDev && options.compiler) {
      if (clientCompileState === 'compiling') {
        res.status(503).type('text/html').send(renderCompilePendingHTML());
        return;
      }
      if (clientCompileState === 'error') {
        const errorInfos = (clientCompileErrors.length > 0
          ? clientCompileErrors
          : ['Unknown client build error.']
        ).map((message) => ({ type: 'build' as const, message }));
        res.status(500).type('text/html').send(renderErrorHTML(errorInfos));
        return;
      }
    }

    const routeHandlerPath = resolveLegacyRouteHandlerPath(runtimeRoot, req.path);
    if (routeHandlerPath) {
      try {
        await runLegacyApiRoute({
          req,
          res,
          apiPath: routeHandlerPath,
          isDev,
        });
        return;
      } catch (error) {
        console.error('[vista:rsc] Route handler error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
        return;
      }
    }

    if (req.path.startsWith('/api/')) {
      await handleApiRoute(req, res, runtimeRoot, isDev, typedApiConfig);
      return;
    }

    const currentRoute = matchRoute(req.path, serverManifest.routes);
    setCurrentSegmentConfig(currentRoute?.segmentConfig);

    // ==================================================================
    // Static / ISR Cache Check
    // ==================================================================
    // Before dynamic rendering, check if we have a pre-rendered page.
    // For ISR pages whose revalidate window has expired, serve the stale
    // cached version immediately and kick off background revalidation.
    // ==================================================================
    if (!isDev) {
      const cached = getCachedPage(req.path);
      if (cached.page) {
        if (cached.stale) {
          // ISR: serve stale page immediately, revalidate in background
          const route = currentRoute;
          if (route && !isRevalidating(req.path)) {
            const urlPath = req.path;
            // Fire-and-forget background revalidation
            revalidatePath(urlPath, route, undefined, runtimeRoot, vistaDirRoot).catch((err) => {
              console.error('[vista:isr] Background revalidation error:', err);
            });
          }
        }
        const pprRequestMode = resolvePprRequestMode({
          headerValue: req.headers['x-vista-prerender'],
          queryValue: (req.query as any)?.__vista_prerender,
        });
        const servePprShell = pprRequestMode === 'shell' && Boolean(cached.page.shellHtml);
        const responseHtml = servePprShell ? cached.page.shellHtml! : cached.page.html;
        res
          .status(200)
          .type('text/html')
          .setHeader('X-Vista-Cache', cached.stale ? 'STALE' : 'HIT');
        if (cached.page.ppr?.enabled) {
          const responseMode =
            pprRequestMode === 'resume' ? 'RESUME' : servePprShell ? 'SHELL' : 'PPR';
          res.setHeader('X-Vista-Prerender', responseMode);
          res.setHeader('X-Vista-Prerender-Resume', cached.page.ppr.resumePath);
          res.setHeader('X-Vista-Prerender-Strategy', cached.page.ppr.strategy);
          res.setHeader(
            'Vary',
            appendVaryHeader(res.getHeader('Vary'), 'x-vista-prerender')
          );
        }
        res.setHeader('X-Vista-Route-Runtime', currentRoute?.segmentConfig.runtime ?? 'nodejs');
        res.send(responseHtml);
        return;
      }
    }

    if (upstreamUnavailableReason) {
      res.status(503).type('text/plain').send(getUpstreamUnavailableMessage());
      return;
    }

    // ==================================================================
    // Flight-Based SSR Path
    // ==================================================================
    // If the Flight SSR client + SSR manifest are available, render pages
    // by fetching the Flight stream from upstream and using
    // renderToPipeableStream for streaming HTML with proper hydration.
    // Falls back to legacy renderToString if Flight SSR is unavailable.
    // ==================================================================

    if (useFlightSSR) {
      try {
        if (isDev && resolvedSSRManifestPath && fs.existsSync(resolvedSSRManifestPath)) {
          try {
            ssrManifest = loadSSRManifestFromDisk(resolvedSSRManifestPath);
          } catch {
            // Manifest may be mid-write during compilation; keep the last good in-memory copy.
          }
        }

        // Metadata extraction: still done locally so we have <head> content
        const rootLayout = resolveRootLayout(runtimeRoot, isDev);
        const route = currentRoute;

        let metadataHtml = '';
        if (route) {
          if (isDev) {
            clearProjectRequireCache(runtimeRoot);
          }
          const PageModule = require(route.pagePath);
          let metadata: any = { ...(rootLayout.metadata || {}) };
          if (PageModule.metadata) {
            metadata = { ...metadata, ...PageModule.metadata };
          }
          if (typeof PageModule.generateMetadata === 'function') {
            const params = extractParams(req.path, route);
            const searchParams = Object.fromEntries(
              new URLSearchParams(req.query as any).entries()
            );
            const dynamicMeta = await PageModule.generateMetadata(
              { params, searchParams },
              metadata
            );
            metadata = { ...metadata, ...dynamicMeta };
          }
          const { generateMetadataHtml } = require('../metadata/generate');
          metadataHtml = metadata ? generateMetadataHtml(metadata) : '';
        }

        // Render the page via Flight stream → SSR
        await renderFlightToHTMLStream(
          upstreamOrigin,
          req.path,
          req.query ? new URLSearchParams(req.query as any).toString() : '',
          metadataHtml,
          findChunkFiles(cwd, isDev),
          rootLayout.mode,
          flightSSRClient!,
          ssrManifest!,
          res,
          isDev
        );
        return;
      } catch (flightError: any) {
        if (flightError?.name === 'NotFoundError' && !res.headersSent) {
          try {
            const rootLayout = resolveRootLayout(runtimeRoot, isDev);
            const route = currentRoute;
            if (route) {
              const segmentNotFoundPath = resolveNearestSegmentNotFoundPath(
                path.join(runtimeRoot, 'app'),
                route.routeDir
              );
              if (segmentNotFoundPath) {
                const params = extractParams(req.path, route);
                const searchParams = Object.fromEntries(
                  new URLSearchParams(req.query as any).entries()
                );
                const notFoundResult = await createRouteElement(
                  {
                    ...route,
                    pagePath: segmentNotFoundPath,
                  },
                  { params, searchParams, req },
                  isDev,
                  rootLayout,
                  runtimeRoot,
                  { disableParallelSlots: true }
                );
                const html = renderToString(notFoundResult.element);
                const { generateMetadataHtml } = require('../metadata/generate');
                const metadataHtml = notFoundResult.metadata
                  ? generateMetadataHtml(notFoundResult.metadata)
                  : '';
                res
                  .status(404)
                  .type('text/html')
                  .send(
                    createHtmlDocument(
                      html,
                      metadataHtml,
                      findChunkFiles(cwd, isDev),
                      notFoundResult.rootMode
                    )
                  );
                return;
              }
            }
          } catch (notFoundError) {
            console.error('[vista:rsc] Failed to render segment not-found fallback:', notFoundError);
          }
        }

        console.error('[vista:rsc] Flight SSR failed:', flightError.message);

        // If headers haven't been sent yet, show the error overlay directly.
        // This is much better than falling through to legacy renderToString,
        // which will likely hit the same error (e.g. useState in a server component).
        if (isDev && !res.headersSent) {
          const errorInfo = {
            type: 'runtime' as const,
            message: flightError.message || 'Flight SSR Error',
            stack: flightError.stack,
          };
          res.status(500).send(renderErrorHTML([errorInfo]));
          return;
        }

        // If headers were already sent (stream was partially flushed),
        // we can't change the status code, but we can inject an error
        // overlay script at the end of the stream.
        if (isDev && res.headersSent) {
          try {
            const errMsg = (flightError.message || 'Flight SSR Error')
              .replace(/'/g, "\\'")
              .replace(/\n/g, '\\n');
            res.write(
              `<script>document.body.innerHTML='';document.body.style.background='#1a1a2e';document.body.style.color='#ff6b6b';document.body.style.fontFamily='monospace';document.body.style.padding='40px';document.body.innerHTML='<h2 style="color:#ff6b6b">\\u26a0 Server Error</h2><pre style="white-space:pre-wrap;color:#ffa07a">${errMsg}</pre>';</script>`
            );
            res.end();
          } catch {
            res.end();
          }
          return;
        }
      }
    }

    // ==================================================================
    // Legacy Fallback: Direct renderToString
    // ==================================================================
    // Used when Flight SSR is unavailable or fails. This path does NOT
    // go through the Flight protocol — it requires page modules directly
    // and renders them with renderToString (synchronous, no streaming).
    // ==================================================================

    try {
      // Check upstream availability for the legacy path
      await withTimeout(
        `${upstreamOrigin}/rsc/`,
        { headers: { Accept: 'text/x-component' } },
        3000
      );
    } catch (error) {
      res.status(503).type('text/plain').send(getUpstreamUnavailableMessage());
      return;
    }

    try {
      const rootLayout = resolveRootLayout(runtimeRoot, isDev);
      const route = currentRoute;
      setCurrentSegmentConfig(route?.segmentConfig);
      if (!route) {
        const resolvedNotFound = resolveNotFoundComponent(runtimeRoot, rootLayout, isDev);
        if (resolvedNotFound) {
          const notFoundElement = React.createElement(resolvedNotFound.component, {
            params: {},
            searchParams: {},
          });
          const wrapped = React.createElement(
            rootLayout.component,
            { params: {}, searchParams: {} },
            notFoundElement
          );
          const html = renderToString(wrapped);
          res
            .status(404)
            .type('text/html')
            .send(createHtmlDocument(html, '', findChunkFiles(cwd, isDev), rootLayout.mode));
          return;
        }
        res.status(404).type('text/html').send(getStyledNotFoundHTML());
        return;
      }

      const params = extractParams(req.path, route);
      const searchParams = Object.fromEntries(new URLSearchParams(req.query as any).entries());
      const { element, metadata, rootMode } = await createRouteElement(
        route,
        { params, searchParams, req },
        isDev,
        rootLayout,
        runtimeRoot
      );
      const appHtml = renderToString(element);
      const { generateMetadataHtml } = require('../metadata/generate');
      const metadataHtml = metadata ? generateMetadataHtml(metadata) : '';
      res
        .status(200)
        .type('text/html')
        .send(createHtmlDocument(appHtml, metadataHtml, findChunkFiles(cwd, isDev), rootMode));
    } catch (error: any) {
      if (error?.name === 'NotFoundError') {
        try {
          const rootLayout = resolveRootLayout(runtimeRoot, isDev);
          const route = currentRoute;
          setCurrentSegmentConfig(route?.segmentConfig);
          if (route) {
            const segmentNotFoundPath = resolveNearestSegmentNotFoundPath(
              path.join(runtimeRoot, 'app'),
              route.routeDir
            );
            if (segmentNotFoundPath) {
              const params = extractParams(req.path, route);
              const searchParams = Object.fromEntries(
                new URLSearchParams(req.query as any).entries()
              );
              const notFoundResult = await createRouteElement(
                {
                  ...route,
                  pagePath: segmentNotFoundPath,
                },
                { params, searchParams, req },
                isDev,
                rootLayout,
                runtimeRoot,
                { disableParallelSlots: true }
              );
              const html = renderToString(notFoundResult.element);
              const { generateMetadataHtml } = require('../metadata/generate');
              const metadataHtml = notFoundResult.metadata
                ? generateMetadataHtml(notFoundResult.metadata)
                : '';
              res
                .status(404)
                .type('text/html')
                .send(
                  createHtmlDocument(
                    html,
                    metadataHtml,
                    findChunkFiles(cwd, isDev),
                    notFoundResult.rootMode
                  )
                );
              return;
            }
          }
          const resolvedNotFound = resolveNotFoundComponent(runtimeRoot, rootLayout, isDev);
          if (resolvedNotFound) {
            const notFoundElement = React.createElement(resolvedNotFound.component, {
              params: {},
              searchParams: {},
            });
            const wrapped = React.createElement(
              rootLayout.component,
              { params: {}, searchParams: {} },
              notFoundElement
            );
            const html = renderToString(wrapped);
            res
              .status(404)
              .type('text/html')
              .send(createHtmlDocument(html, '', findChunkFiles(cwd, isDev), rootLayout.mode));
            return;
          }
          res.status(404).type('text/html').send(getStyledNotFoundHTML());
          return;
        } catch (notFoundError) {
          console.error('[vista:rsc] Failed to render NotFoundError fallback:', notFoundError);
        }
      }
      console.error('[vista:rsc] Render error:', error);
      if (isDev) {
        const errorInfo = {
          type: 'runtime' as const,
          message: error.message || 'Unknown Server Error',
          stack: error.stack,
        };
        res.status(500).send(renderErrorHTML([errorInfo]));
      } else {
        res.status(500).send('<h1>Internal Server Error</h1>');
      }
    }
      }
    );
  });

  const server = app.listen(port, () => {
    printServerReady({ port, mode: 'rsc', rscFlight: useFlightSSR });
  });
  httpServer = server;

  server.on('error', (error: any) => {
    if (error?.code === 'EADDRINUSE') {
      logError(`Port ${port} is already in use.`);
      process.exit(1);
      return;
    }
    logError(`RSC startup failed: ${(error as Error)?.message || String(error)}`);
    process.exit(1);
  });
}

export { startRSCServer as default };
