import express from 'express';
import fs from 'fs';
import path from 'path';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Transform } from 'stream';
import webpack from 'webpack';
import webpackDevMiddleware from 'webpack-dev-middleware';
import webpackHotMiddleware from 'webpack-hot-middleware';
import {
  WRAPPED_MARKER,
  THEME_SETTER,
  SSE_ENDPOINT,
  IMAGE_ENDPOINT,
  URL_PREFIX,
  BUILD_DIR,
} from '../constants';
import { RouterProvider } from '../index';
import {
  loadConfig,
  resolveCacheComponentsConfig,
  resolveAndApplyEngineVariant,
  resolveStructureValidationConfig,
  resolveTypedApiConfig,
} from '../config';
import { ErrorOverlay, renderErrorHTML } from '../dev-error';
import { assertVistaArtifacts } from './artifact-validator';
import {
  resolveNotFoundComponent,
  resolveRootLayout,
  resolveLayoutChain,
  type RootRenderMode,
  type ResolvedLayout,
} from './root-resolver';
import { StructureWatcher, type StructureWatchEvent } from './structure-watch';
import { runMiddleware, applyMiddlewareResult } from './middleware-runner';
import { createImageHandler } from './image-optimizer';
import { getCachedPage, loadStaticPagesFromDisk, isRevalidating } from './static-cache';
import { resolvePprRequestMode } from './ppr';
import { revalidatePath } from './static-generator';
import { getAllFontHTML as getFontHeadHTML } from '../font/registry';
import { getStyledNotFoundHTML } from './not-found-page';
import {
  resolveRouteHandler,
  runRouteHandler,
  resolveLegacyRouteHandlerPath,
  resolveLegacyApiRoutePath,
  runLegacyApiRoute,
  runTypedApiRoute,
} from './typed-api-runtime';
import {
  printServerReady,
  requestLogger,
  logInfo,
  logEvent,
  logError,
  logCompiling,
  logCompiled,
} from './logger';
import type { StructureValidationResult } from './structure-validator';
import {
  logValidationResult,
  logDevBlocked,
  logDevUnblocked,
  logWatcherStart,
  formatIssuesForOverlay,
} from './structure-log';
import { installModuleCompileHook } from './module-compile-hook';
import { runWithRequestContext } from './request-context';

// Support CSS imports on server runtime
// - Regular .css: ignored (handled by PostCSS)
// - .module.css: return empty class mapping (webpack build handles real mappings)
require.extensions['.css'] = (m: any, filename: string) => {
  if (filename.endsWith('.module.css')) {
    m.exports = {};
  }
};

// Use SWC for faster server-side TypeScript compilation
try {
  // Try to resolve from project's node_modules first (where apps install their deps)
  const swcRegisterPath = require.resolve('@swc-node/register/register', {
    paths: [process.cwd(), path.resolve(process.cwd(), '..'), path.resolve(process.cwd(), '..', '..')],
  });
  const typescriptPath = require.resolve('typescript', {
    paths: [process.cwd(), path.resolve(process.cwd(), '..'), path.resolve(process.cwd(), '..', '..')],
  });
  const { register } = require(swcRegisterPath) as { register: (options?: Record<string, any>) => void };
  const ts = require(typescriptPath) as typeof import('typescript');
  register({
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    esModuleInterop: true,
    allowJs: true,
  });
} catch (e) {
  // Fallback to ts-node if @swc-node not available
  try {
    const tsNodePath = require.resolve('ts-node', {
      paths: [process.cwd(), path.resolve(process.cwd(), '..'), path.resolve(process.cwd(), '..', '..')],
    });
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
  } catch (e2) {
    // No TypeScript compiler found
  }
}

installModuleCompileHook({ cwd: process.cwd() });

// ============================================================================
// RSC: Auto-wrap client components with hydration markers
// ============================================================================
import { wrapClientComponent } from './client-boundary';

// Cache absolute client file path -> stable component ID
const clientComponentIdsByPath = new Map<string, string>();

// Initialize client component registry from scan
function normalizeModulePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

function toComponentId(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/\.(tsx|ts|jsx|js)$/, '');
}

function registerClientComponents(scanDir: string, prefix: string = ''): number {
  if (!fs.existsSync(scanDir)) return 0;

  const { scanAppDirectory } = require('../bin/file-scanner');
  const result = scanAppDirectory(scanDir);

  result.clientComponents.forEach((component: { absolutePath: string; relativePath: string }) => {
    const normalizedAbsolute = normalizeModulePath(component.absolutePath);
    const prefixedPath = prefix ? `${prefix}${component.relativePath}` : component.relativePath;
    clientComponentIdsByPath.set(normalizedAbsolute, toComponentId(prefixedPath));
  });

  return result.clientComponents.length;
}

function initClientComponentRegistry(appDir: string, cwd: string): void {
  try {
    clientComponentIdsByPath.clear();

    const appCount = registerClientComponents(appDir);
    const componentsCount = registerClientComponents(path.join(cwd, 'components'), 'components/');

    if (process.env.VISTA_DEBUG) {
      console.log(
        `[Vista JS RSC] Registered ${clientComponentIdsByPath.size} client component(s) for hydration wrapping (app=${appCount}, components=${componentsCount})`
      );
    }
  } catch (e) {
    // Fallback - scanning not available
  }
}

function getClientComponentId(filePath: string): string | null {
  const normalized = normalizeModulePath(filePath);
  return clientComponentIdsByPath.get(normalized) ?? null;
}

// Store original require for tsx/ts files
const Module = require('module');
const originalLoad = Module._load;

// CRITICAL: Ensure single React instance across all requires
// This fixes "Invalid hook call" errors during SSR with monorepo/linked packages
const reactPath = require.resolve('react');
const reactDomPath = require.resolve('react-dom');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  // Redirect all react/react-dom requires to our single instance
  if (request === 'react') {
    return reactPath;
  }
  if (request === 'react-dom') {
    return reactDomPath;
  }
  if (request.startsWith('react-dom/')) {
    // Handle subpaths like react-dom/server, react-dom/client
    const subpath = request.replace('react-dom/', '');
    try {
      return require.resolve(`react-dom/${subpath}`, { paths: [path.dirname(reactDomPath)] });
    } catch {
      return originalResolveFilename.call(this, request, parent, isMain, options);
    }
  }
  if (request.startsWith('react/')) {
    // Handle subpaths like react/jsx-runtime
    const subpath = request.replace('react/', '');
    try {
      return require.resolve(`react/${subpath}`, { paths: [path.dirname(reactPath)] });
    } catch {
      return originalResolveFilename.call(this, request, parent, isMain, options);
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Global flag to control wrapping
let wrapClientComponents = false;

export function enableClientComponentWrapping(appDir: string, cwd: string): void {
  initClientComponentRegistry(appDir, cwd);

  // Clear require cache for client component files so they can be wrapped
  for (const clientPath of clientComponentIdsByPath.keys()) {
    // Find and clear all cached versions of this module
    for (const cachedPath of Object.keys(require.cache)) {
      const normalizedCached = normalizeModulePath(cachedPath);
      if (normalizedCached === clientPath) {
        delete require.cache[cachedPath];
      }
    }
  }

  wrapClientComponents = true;

  // Override Module._load to wrap client components
  Module._load = function (request: string, parent: any, isMain: boolean) {
    const result = originalLoad.apply(this, arguments);

    // Only process if wrapping is enabled and we have a parent with filename
    if (wrapClientComponents && parent?.filename) {
      try {
        const resolved = Module._resolveFilename(request, parent, isMain);

        // Check if this is a client component
        const componentId = getClientComponentId(resolved);
        if (componentId && result?.default) {
          // Wrap the default export if not already wrapped
          if (!result.default[WRAPPED_MARKER]) {
            const OriginalComponent = result.default;
            const WrappedComponent = wrapClientComponent(OriginalComponent, componentId);
            (WrappedComponent as any)[WRAPPED_MARKER] = true;
            result.default = WrappedComponent;
          }
        }
      } catch (e) {
        // Ignore resolution errors
      }
    }

    return result;
  };
}

export function disableClientComponentWrapping(): void {
  wrapClientComponents = false;
}
// ============================================================================

export function startServer(port: number = 3003, compiler?: webpack.Compiler) {
  const app = express();
  const cwd = process.cwd();
  const vistaConfig = loadConfig(cwd);
  const cacheComponentsConfig = resolveCacheComponentsConfig(vistaConfig);
  const engineVariant = resolveAndApplyEngineVariant(vistaConfig);
  const typedApiConfig = resolveTypedApiConfig(vistaConfig);
  const isDev = process.env.NODE_ENV !== 'production';
  const appDir = path.join(cwd, 'app');
  if (process.env.VISTA_DEBUG) {
    logInfo(`Engine variant: ${engineVariant}`);
  }

  installModuleCompileHook({
    cwd,
    cacheComponentsEnabled: cacheComponentsConfig.enabled,
  });

  // Allow port override from config
  const finalPort = vistaConfig.server?.port || port;

  // Request logger — logs GET/POST with timing (skip internal webpack requests)
  app.use(requestLogger());

  // In dev mode, webpack-dev-middleware serves client.js from memory — skip artifact check
  if (!isDev) {
    try {
      assertVistaArtifacts(cwd, 'legacy');
    } catch (error) {
      const message = (error as Error).message;
      console.error(message);
      process.exit(1);
    }
  }

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

  // Enable RSC: Auto-wrap client components with hydration markers
  enableClientComponentWrapping(appDir, cwd);

  // Load pre-rendered static pages from disk into in-memory cache
  const vistaDirRoot = path.join(cwd, BUILD_DIR);
  const loadedStaticPages = loadStaticPagesFromDisk(vistaDirRoot);
  if (loadedStaticPages > 0) {
    logInfo(`Loaded ${loadedStaticPages} pre-rendered page(s) from cache`);
  }

  // Webpack Dev + Hot Middleware (only in dev mode with compiler)
  if (isDev && compiler) {
    if (process.env.VISTA_DEBUG) logInfo('Webpack HMR enabled');

    app.use(
      webpackDevMiddleware(compiler, {
        publicPath: '/',
        stats: 'errors-warnings',
        writeToDisk: (filePath) => {
          // Write CSS to disk (served statically)
          return filePath.endsWith('.css');
        },
      })
    );

    app.use(
      webpackHotMiddleware(compiler, {
        log: false, // Reduce console noise
        path: '/__webpack_hmr',
        heartbeat: 2000,
      })
    );

    // Server-Side Live Reload via SSE
    // Watches server component files and triggers page reload
    const sseClients: Set<express.Response> = new Set();

    // SSE endpoint for server reload
    app.get(SSE_ENDPOINT, (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      sseClients.add(res);

      // Send initial connection message
      res.write('data: connected\n\n');

      req.on('close', () => {
        sseClients.delete(res);
      });
    });

    // Watch server files and trigger reload
    let debounceTimer: NodeJS.Timeout | null = null;
    const triggerReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        logEvent('Server file changed, reloading...');
        sseClients.forEach((client) => {
          client.write('data: reload\n\n');
        });
      }, 60);
    };

    // Push compile errors to browser via SSE
    const pushCompileError = (errorMessages: string[]) => {
      const normalized = (Array.isArray(errorMessages) ? errorMessages : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
      const fallback = normalized.length > 0 ? normalized.join('\n\n') : 'Unknown build error.';
      const errorData = JSON.stringify({
        type: 'error',
        message: fallback,
        errors: normalized.length > 0 ? normalized : [fallback],
      });
      sseClients.forEach((client) => {
        client.write(`data: ${errorData}\n\n`);
      });
    };

    // Push build success to browser
    const pushBuildSuccess = () => {
      const data = JSON.stringify({ type: 'ok' });
      sseClients.forEach((client) => {
        client.write(`data: ${data}\n\n`);
      });
    };

    // Listen to webpack compilation errors
    compiler.hooks.done.tap('VistaSSE', (stats) => {
      if (stats.hasErrors()) {
        const errors = stats.toJson().errors || [];
        const errorMessages = errors
          .map((e) => {
            if (typeof e === 'string') return e;
            if (e && typeof e.message === 'string') return e.message;
            return String(e || '');
          })
          .filter((entry) => entry.trim().length > 0);
        logEvent('Build error detected, pushing to browser...');
        pushCompileError(errorMessages);
      } else {
        pushBuildSuccess();
      }
    });

    // Watch the app directory for server file changes
    fs.watch(appDir, { recursive: true }, (event, filename) => {
      if (filename && (filename.endsWith('.tsx') || filename.endsWith('.ts'))) {
        // Check if it's a server component (not client)
        const filePath = path.join(appDir, filename);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Server files don't have 'use client' directive
          if (!content.includes("'use client'") && !content.includes('"use client"')) {
            triggerReload();
          }
        } catch (e) {
          // File might be deleted or being written
        }
      }
    });

    // ====================================================================
    // Structure Validation Watcher (dev mode)
    // ====================================================================
    if (structureConfig.enabled) {
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
          // Push structure error to browser via SSE
          const overlayMessage = formatIssuesForOverlay(
            currentStructureState,
            structureConfig.includeWarningsInOverlay
          );
          const errorData = JSON.stringify({
            type: 'structure-error',
            message: overlayMessage,
          });
          sseClients.forEach((client) => {
            client.write(`data: ${errorData}\n\n`);
          });
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
          sseClients.forEach((client) => {
            client.write(`data: ${data}\n\n`);
          });
        }
      });

      logWatcherStart();
      structureWatcher.start().catch((err) => {
        console.error('[vista:validate] Failed to start structure watcher:', err);
      });
    }
  }

  // Serve static files (public)
  app.use(express.static(path.join(cwd, 'public')));

  // Image optimization endpoint
  const imageHandler = createImageHandler(cwd, isDev);
  app.get(IMAGE_ENDPOINT, imageHandler);

  // Serve .vista build artifacts with proper routing
  // /_vista/static/* -> .vista/static/*
  app.use(`${URL_PREFIX}/static`, express.static(path.join(cwd, BUILD_DIR, 'static')));

  // Legacy: Serve .vista root for backward compatibility (client.css, etc.)
  app.use(express.static(path.join(cwd, BUILD_DIR)));

  app.use(async (req, res, next) => {
    if (req.path.startsWith('/styles.css') || req.path.startsWith('/__webpack_hmr')) {
      return next();
    }

    await runWithRequestContext(
      {
        req,
        res,
        cwd,
        vistaDirRoot,
        urlPath: req.path,
      },
      async () => {

    // ====================================================================
    // Structure validation gate (strict-block in dev)
    // ====================================================================
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
      res.status(500).send(renderErrorHTML([errorInfo]));
      return;
    }

    // MIDDLEWARE SUPPORT
    const middlewareResult = await runMiddleware(req, cwd, isDev);
    const finalized = applyMiddlewareResult(middlewareResult, req, res);
    if (finalized) return;

    const resolvedRoute = resolveRouteHandler(cwd, req.path, { isDev });
    if (resolvedRoute) {
      try {
        await runRouteHandler({
          req,
          res,
          apiPath: resolvedRoute.filePath,
          isDev,
          params: resolvedRoute.params,
        });
        return;
      } catch (error) {
        console.error(
          `[vista:ssr] Route handler error: ${(error as Error)?.message ?? String(error)}`
        );
        return res.status(500).json({ error: 'Internal Server Error in route handler' });
      }
    }

    // API ROUTES SUPPORT - Next.js App Router Style
    if (req.path.startsWith('/api/')) {
      const typedHandled = await runTypedApiRoute({
        req,
        res,
        cwd,
        isDev,
        config: typedApiConfig,
      });
      if (typedHandled) {
        return;
      }

      return res.status(404).json({ error: 'API Route Not Found' });
    }

    // ==================================================================
    // Static / ISR Cache Check
    // ==================================================================
    {
      const cached = getCachedPage(req.path);
      if (cached.page) {
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
        res.setHeader('X-Vista-Route-Runtime', 'nodejs');
        res.send(responseHtml);
        return;
      }
    }

    try {
      let pagePath;
      let params: any = {};

      // Route Matching Logic
      const getExactPath = (p: string) => {
        if (p === '/' || p === '/index') return path.resolve(cwd, 'app', 'index.tsx');
        return path.resolve(cwd, 'app', p.substring(1), 'page.tsx');
      };

      const tryPath = getExactPath(req.path);

      // Clear require cache for hot reloading in dev
      if (isDev) {
        Object.keys(require.cache).forEach((key) => {
          if (key.includes(cwd) && key.includes('app')) {
            delete require.cache[key];
          }
        });
      }

      if (fs.existsSync(tryPath)) {
        pagePath = tryPath;
      } else {
        // Dynamic Route Matching
        const segments = req.path.split('/').filter(Boolean);
        const appDir = path.resolve(cwd, 'app');

        if (segments.length === 2) {
          const [section, paramVal] = segments;
          const sectionPath = path.join(appDir, section);

          if (fs.existsSync(sectionPath) && fs.statSync(sectionPath).isDirectory()) {
            const subEntries = fs.readdirSync(sectionPath, { withFileTypes: true });
            const dynamicFolder = subEntries.find(
              (d) =>
                d.isDirectory() &&
                d.name.startsWith('[') &&
                d.name.endsWith(']') &&
                d.name !== '[not-found]'
            );

            if (dynamicFolder) {
              const paramName = dynamicFolder.name.slice(1, -1);
              params[paramName] = paramVal;
              pagePath = path.join(sectionPath, dynamicFolder.name, 'page.tsx');
            }
          }
        }
      }

      const rootLayout = resolveRootLayout(cwd, isDev);

      // 404 Handling
      if (!pagePath || !fs.existsSync(pagePath)) {
        const resolvedNotFound = resolveNotFoundComponent(cwd, rootLayout, isDev);
        if (resolvedNotFound) {
          renderApp(
            req,
            res,
            resolvedNotFound.component,
            rootLayout.component,
            {},
            { ...(rootLayout.metadata || {}), title: '404 Not Found' },
            vistaConfig,
            404,
            isDev,
            rootLayout.mode
          );
          return;
        }
        res.status(404).type('text/html').send(getStyledNotFoundHTML());
        return;
      }

      // Load Modules
      const PageModule = require(pagePath);
      const PageComponent = PageModule.default;
      const RootComponent = rootLayout.component;

      if (!PageComponent) {
        res.status(500).send('<h1>Page does not export default component</h1>');
        return;
      }

      // Data Fetching
      let props: any = {};
      if (PageModule.getServerProps) {
        props = await PageModule.getServerProps({ query: req.query, params, req });
      }

      // Resolve the full nested layout chain (root → page directory)
      const pageDir = path.dirname(pagePath);
      const layouts = resolveLayoutChain(cwd, pageDir, isDev);

      // Metadata extraction - merge all layout metadata + page metadata
      let metadata: any = {};
      for (const layout of layouts) {
        if (layout.metadata) {
          metadata = { ...metadata, ...layout.metadata };
        }
      }

      // Get page static metadata (overrides layouts)
      if (PageModule.metadata) {
        metadata = { ...metadata, ...PageModule.metadata };
      }

      // Get dynamic metadata from generateMetadata function
      if (typeof PageModule.generateMetadata === 'function') {
        try {
          const dynamicMeta = await PageModule.generateMetadata(
            { params, searchParams: req.query },
            metadata // parent metadata
          );
          metadata = { ...metadata, ...dynamicMeta };
        } catch (e) {
          console.error('Error in generateMetadata:', e);
        }
      }

      // Render with nested layouts
      renderApp(
        req,
        res,
        PageComponent,
        RootComponent,
        { ...props, params },
        metadata,
        vistaConfig,
        200,
        isDev,
        rootLayout.mode,
        layouts.length > 0 ? layouts : undefined
      );
    } catch (err: any) {
      if (err?.name === 'NotFoundError') {
        try {
          const rootLayout = resolveRootLayout(cwd, isDev);
          const resolvedNotFound = resolveNotFoundComponent(cwd, rootLayout, isDev);
          if (resolvedNotFound) {
            renderApp(
              req,
              res,
              resolvedNotFound.component,
              rootLayout.component,
              {},
              { ...(rootLayout.metadata || {}), title: '404 Not Found' },
              vistaConfig,
              404,
              isDev,
              rootLayout.mode
            );
            return;
          }
          res.status(404).type('text/html').send(getStyledNotFoundHTML());
          return;
        } catch (notFoundError) {
          console.error(
            `[vista:ssr] Failed to render NotFoundError fallback: ${(notFoundError as Error)?.message ?? String(notFoundError)}`
          );
        }
      }
      console.error(`[vista:ssr] Render error: ${err?.message || 'Unknown error'}`);
      if (process.env.VISTA_DEBUG) {
        console.error(err);
      }
      // Render Server-Side Error Overlay
      const errorInfo = {
        type: 'runtime' as const,
        message: err.message || 'Unknown Server Error',
        stack: err.stack,
        file: (err.message.match && err.message.match(/(app\/.*?):(\d+):(\d+)/)?.[1]) || undefined,
      };

      res.status(500).send(renderErrorHTML([errorInfo]));
    }
      }
    );
  });

  const server = app.listen(finalPort, () => {
    printServerReady({ port: finalPort, mode: 'legacy' });
  });

  server.on('error', (error: any) => {
    if (error?.code === 'EADDRINUSE') {
      logError(`Port ${finalPort} is already in use.`);
      process.exit(1);
      return;
    }

    logError(`Startup failed: ${error?.message || String(error)}`);
    if (process.env.VISTA_DEBUG) {
      console.error(error);
    }
    process.exit(1);
  });
}

// Helper to encapsulate Render Logic
function renderApp(
  req: any,
  res: any,
  PageComponent: any,
  RootComponent: any,
  props: any,
  metadata: any,
  config: any,
  status: number = 200,
  isDev: boolean = false,
  rootMode: RootRenderMode = 'legacy',
  /** Optional full layout chain (outermost → innermost). When provided, RootComponent is ignored. */
  layouts?: ResolvedLayout[]
) {
  // Import RouterContext from the router module
  const { RouterContext } = require('../client/router');
  const { generateMetadataHtml } = require('../metadata/generate');

  // Create router context value matching client structure
  const routerValue = {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
    refresh: () => {},
    params: props.params || {},
    pathname: req.path,
  };

  // Build the nested layout tree: Layout0 > Layout1 > ... > Page
  let pageTree: React.ReactElement = React.createElement(PageComponent, props);

  if (layouts && layouts.length > 0) {
    // Wrap page in layouts from innermost to outermost
    for (let i = layouts.length - 1; i >= 0; i--) {
      const LayoutComp = layouts[i].component;
      pageTree = React.createElement(LayoutComp, { params: props.params || {} }, pageTree);
    }
  } else {
    // Fallback: single root layout wrapping page
    pageTree = React.createElement(RootComponent, { params: props.params || {} }, pageTree);
  }

  // App content that will be hydrated inside #root
  const appContent = React.createElement(RouterContext.Provider, { value: routerValue }, pageTree);

  const appElement =
    rootMode === 'document'
      ? React.createElement(RouterContext.Provider, { value: routerValue }, pageTree)
      : (() => {
          // Full HTML document shell - legacy mode.
          const criticalCss = `
                html, body { background: #0a0a0a; color: #ededed; }
                html.light, html.light body { background: #ffffff; color: #171717; }
            `;
          const themeScript = `
                (function() {
                    var d = document.documentElement;
                    d.classList.add('dark');
                    d.classList.remove('light');
                    d.style.colorScheme = 'dark';
                    window.${THEME_SETTER} = function(newTheme) {
                        d.classList.remove('light', 'dark');
                        d.classList.add(newTheme);
                        d.style.colorScheme = newTheme;
                    };
                })();
            `;
          return React.createElement(
            'html',
            { lang: 'en', className: 'dark' },
            React.createElement(
              'head',
              null,
              React.createElement('style', {
                dangerouslySetInnerHTML: { __html: criticalCss },
                'data-vista-critical': 'true',
              }),
              React.createElement('script', {
                dangerouslySetInnerHTML: { __html: themeScript },
              })
            ),
            React.createElement(
              'body',
              { className: 'antialiased' },
              React.createElement('div', { id: 'root' }, appContent)
            )
          );
        })();

  let didError = false;

  // Generate metadata HTML from metadata object
  let metadataHtml = '';
  if (metadata) {
    try {
      metadataHtml = generateMetadataHtml(metadata);
    } catch (e) {
      console.error('Error generating metadata HTML:', e);
    }
  }

  const injectStream = new Transform({
    transform(chunk: any, encoding: any, callback: any) {
      let chunkString = chunk.toString();

      if (chunkString.includes('</head>')) {
        // Inject metadata + CSS + Charset
        const fontHtml = getFontHeadHTML();
        const headInjection = `<meta charset="utf-8" />${metadataHtml}${fontHtml}<link rel="stylesheet" href="/client.css">`;
        chunkString = chunkString.replace('</head>', `${headInjection}</head>`);
      }

      if (chunkString.includes('</body>')) {
        const hydrationScript = `
                    <script>window.__VISTA_HYDRATE_DOCUMENT__ = ${rootMode === 'document' ? 'true' : 'false'};</script>
                    <script>
                        window.__INITIAL_PROPS__ = ${JSON.stringify(props)};
                        window.__VISTA_CONFIG__ = ${JSON.stringify(config)};
                    </script>
                    <script src="/vista-client-manifest.js"></script>
                    <script src="/client.js"></script>
                `;
        chunkString = chunkString.replace('</body>', `${hydrationScript}</body>`);
      }

      this.push(chunkString);
      callback();
    },
  });

  const stream = renderToPipeableStream(appElement, {
    onShellReady() {
      res.statusCode = didError ? 500 : status;
      res.setHeader('Content-type', 'text/html; charset=utf-8');
      stream.pipe(injectStream).pipe(res);
    },
    onShellError(err: any) {
      res.statusCode = 500;
      res.send('<!doctype html><p>Loading...</p>');
    },
    onError(err: any) {
      didError = true;
      console.error(`[vista:ssr] Stream error: ${err?.message || 'Unknown stream error'}`);
      if (process.env.VISTA_DEBUG) {
        console.error(err);
      }
    },
  });
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
