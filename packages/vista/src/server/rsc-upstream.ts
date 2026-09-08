import express from 'express';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { PassThrough } from 'stream';
import { fileURLToPath, pathToFileURL } from 'url';

import type { RouteEntry, ServerManifest } from '../build/rsc/server-manifest';
import { normalizeReactClientReferenceManifest } from '../build/rsc/react-client-reference-manifest';
import { resolveNotFoundComponent, resolveRootLayout } from './root-resolver';
import { BUILD_DIR } from '../constants';
import { installModuleCompileHook } from './module-compile-hook';
import {
  consumeRevalidatedPaths,
  consumeRevalidatedTags,
  runWithRequestContext,
  setCurrentSegmentConfig,
} from './request-context';
import { resolveRegisteredServerReference } from './runtime-actions';
import {
  resolveConventionModule,
  resolveDirectoryChain,
  resolveNearestSegmentNotFoundPath,
  resolveParallelSlotMatches,
} from './app-router-runtime';
import { installSegmentFetchPolicyShim } from './fetch-policy';
import { resolveRuntimeProjectRoot } from './runtime-artifacts';
import { loadConfig, resolveCacheComponentsConfig } from '../config';
import { resolveVistaSourceRequest } from './vista-import-map';
import { createProjectAliasResolver } from './project-alias-resolver';

// NOTE: RouteErrorBoundary and RouteSuspense are 'use client' components.
// Under --conditions react-server, React.Component is not available, so we
// must NOT import them at the top level.  Instead we lazy-require them after
// the client-load hook has been installed (which turns them into Flight
// client references automatically).
let _RouteErrorBoundary: any = null;
let _RouteSuspense: any = null;

function getRouteErrorBoundary() {
  if (!_RouteErrorBoundary) {
    _RouteErrorBoundary = require('../components/error-boundary').RouteErrorBoundary;
  }
  return _RouteErrorBoundary;
}

function getRouteSuspense() {
  if (!_RouteSuspense) {
    _RouteSuspense = require('../components/route-suspense').RouteSuspense;
  }
  return _RouteSuspense;
}

const CjsModule = require('module');
// Support CSS imports on server runtime
require.extensions['.css'] = (m: any, filename: string) => {
  if (filename.endsWith('.module.css')) {
    m.exports = {};
  }
};

type FlightServerApi = {
  renderToPipeableStream: (
    model: React.ReactNode,
    moduleMap: any,
    options?: { onError?: (error: unknown) => void }
  ) => { pipe: (destination: NodeJS.WritableStream) => void };
  createClientModuleProxy: (id: string) => any;
  decodeReply: (body: string | FormData, webpackMap: any) => Promise<unknown[]>;
  decodeAction: (body: FormData, serverManifest: any) => Promise<() => unknown>;
  registerServerReference: (reference: Function, id: string, exportName: string) => void;
};

let installedClientLoadHook = false;
let originalCompile: any = null;
let reactResolutionInstalled = false;
let originalResolveFilename: any = null;
const clientDirectiveCache = new Map<string, boolean>();

function resolveVistaInternalRequest(request: string): string | null {
  return resolveVistaSourceRequest(request, path.resolve(__dirname, '..'));
}

function parseCliArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function resolvePort(defaultPort: number): number {
  const raw = parseCliArg('--port') ?? process.env.RSC_UPSTREAM_PORT ?? String(defaultPort);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid upstream port: ${raw}`);
  }
  return port;
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

function normalizeModulePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

function shouldInvalidateDevModule(modulePath: string, cwd: string): boolean {
  const normalized = normalizeModulePath(modulePath);
  const rootPrefix = normalizeModulePath(`${cwd}${path.sep}`);

  if (!normalized.startsWith(rootPrefix)) return false;
  if (normalized.includes('/node_modules/')) return false;
  if (normalized.includes(`/${BUILD_DIR.toLowerCase()}/`)) return false;

  return /\.(?:[cm]?[jt]sx?|json)$/i.test(normalized);
}

function clearProjectRequireCache(cwd: string): void {
  for (const key of Object.keys(require.cache)) {
    if (!shouldInvalidateDevModule(key, cwd)) continue;
    delete require.cache[key];
    clientDirectiveCache.delete(key);
  }
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
    // tsx/cjs registers the TypeScript loader for require()
    require(tsxPath);
    return;
  } catch {
    throw new Error(
      'No TypeScript compiler available for RSC upstream runtime. Install one of: @swc-node/register, ts-node, or tsx'
    );
  }
}

function hasClientBoundaryDirective(source: string): boolean {
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
  return trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"');
}

function isClientBoundaryFile(filename: string, transpiledSource: string): boolean {
  const cached = clientDirectiveCache.get(filename);
  if (cached !== undefined) return cached;

  let isClient = false;
  try {
    const originalSource = fs.readFileSync(filename, 'utf-8');
    isClient = hasClientBoundaryDirective(originalSource);
  } catch {
    isClient = hasClientBoundaryDirective(transpiledSource);
  }

  clientDirectiveCache.set(filename, isClient);
  return isClient;
}

function installSingleReactResolution(cwd: string): void {
  if (reactResolutionInstalled) return;

  let reactPath: string;
  let reactDomPath: string;
  try {
    reactPath = require.resolve('react');
    reactDomPath = require.resolve('react-dom');
  } catch {
    return;
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

function installClientLoadHook(cwd: string, createClientModuleProxy: (id: string) => any): void {
  if (installedClientLoadHook) return;
  const cacheComponentsConfig = resolveCacheComponentsConfig(loadConfig(cwd));
  installModuleCompileHook({
    cwd,
    createClientModuleProxy,
    cacheComponentsEnabled: cacheComponentsConfig.enabled,
  });
  installedClientLoadHook = true;
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
      return true;
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
  const sorted = [...routes].sort((a, b) => {
    const aOptional = a.pattern.includes('*?');
    const bOptional = b.pattern.includes('*?');
    if (aOptional && !bOptional) return 1;
    if (!aOptional && bOptional) return -1;
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
    wrappedElement = React.createElement(getRouteSuspense(), {
      loadingComponent,
      children: wrappedElement,
    } as any) as React.ReactElement;
  }

  if (errorComponent) {
    wrappedElement = React.createElement(getRouteErrorBoundary(), {
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
    pathname: string;
    params: Record<string, string>;
    searchParams: Record<string, string>;
    req: express.Request;
  },
  isDev: boolean,
  runtimeRoot: string,
  options: {
    disableParallelSlots?: boolean;
  } = {}
): Promise<React.ReactElement> {
  const { pathname, params, searchParams, req } = context;

  if (isDev) {
    clearProjectRequireCache(runtimeRoot);
  }

  return renderAppSubtreeElement({
    subtreeRootDir: path.join(runtimeRoot, 'app'),
    entryFilePath: route.pagePath,
    pathname,
    params,
    searchParams,
    req,
    cwd: runtimeRoot,
    evaluateLeafMetadata: true,
    disableParallelSlots: options.disableParallelSlots,
  });
}

async function readRawRequestBody(req: express.Request): Promise<Buffer> {
  if (typeof req.body === 'string') {
    return Buffer.from(req.body);
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function parseMultipartFormData(
  req: express.Request,
  rawBody: Buffer
): Promise<FormData> {
  const request = new Request(`http://127.0.0.1${req.originalUrl || req.url || '/'}`, {
    method: req.method || 'POST',
    headers: req.headers as Record<string, string>,
    body: rawBody as any,
  });

  return request.formData();
}

function getSearchParamsFromRequest(req: express.Request): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(req.query as any).entries());
}

function startUpstream(): void {
  const cwd = path.resolve(process.env.VISTA_ARTIFACT_ROOT || process.cwd());
  const runtimeRoot = resolveRuntimeProjectRoot(cwd, process.env.VISTA_RUNTIME_ROOT);
  const isDev = process.env.NODE_ENV !== 'production';
  const port = resolvePort(3101);
  const vistaDirRoot = path.join(cwd, BUILD_DIR);

  installSingleReactResolution(runtimeRoot);
  setupTypeScriptRuntime(runtimeRoot);

  const flightServerPath = resolveFromWorkspace('react-server-dom-webpack/server.node', cwd);
  const flightServer = require(flightServerPath) as FlightServerApi;
  installClientLoadHook(runtimeRoot, flightServer.createClientModuleProxy);
  installSegmentFetchPolicyShim();

  const serverManifestPath = path.join(cwd, BUILD_DIR, 'server', 'server-manifest.json');
  const flightManifestPath = path.join(cwd, BUILD_DIR, 'react-client-manifest.json');

  if (!fs.existsSync(serverManifestPath)) {
    throw new Error('Missing RSC server manifest. Run "vista build" first.');
  }
  // In dev mode the flight manifest may not exist yet (webpack-dev-middleware
  // hasn't completed the first compilation).  Write a stub so we can start,
  // and reload on each request.
  if (!fs.existsSync(flightManifestPath)) {
    if (isDev) {
      fs.writeFileSync(flightManifestPath, '{}');
    } else {
      throw new Error('Missing RSC flight manifest. Run "vista build" first.');
    }
  }

  let serverManifest = JSON.parse(fs.readFileSync(serverManifestPath, 'utf-8')) as ServerManifest;
  let flightManifest = normalizeReactClientReferenceManifest(
    JSON.parse(fs.readFileSync(flightManifestPath, 'utf-8'))
  );

  const app = express();

  const pipeFlightModel = async (
    res: express.Response,
    model: React.ReactElement,
    status: number
  ): Promise<void> => {
    let capturedError: unknown = null;
    let gateResolved = false;
    let streamEnded = false;
    const gateStream = new PassThrough();
    const bufferedChunks: Buffer[] = [];

    const finishGate = (() => {
      let resolver: (() => void) | null = null;
      const promise = new Promise<void>((resolve) => {
        resolver = () => {
          if (gateResolved) {
            return;
          }
          gateResolved = true;
          resolve();
        };
      });
      return { promise, resolve: () => resolver?.() };
    })();

    const onData = (chunk: Buffer | string) => {
      bufferedChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      finishGate.resolve();
    };

    gateStream.on('data', onData);
    gateStream.once('end', () => {
      streamEnded = true;
      finishGate.resolve();
    });
    gateStream.once('error', () => {
      finishGate.resolve();
    });

    const stream = flightServer.renderToPipeableStream(model, flightManifest, {
      onError(error) {
        capturedError = error;
        if ((error as any)?.name !== 'NotFoundError') {
          console.error('[vista:rsc] Upstream flight render error:', error);
        }
        finishGate.resolve();
      },
    });

    stream.pipe(gateStream);

    const gateTimer = setTimeout(() => finishGate.resolve(), 75);
    await finishGate.promise;
    clearTimeout(gateTimer);

    if ((capturedError as any)?.name === 'NotFoundError') {
      gateStream.destroy();
      throw capturedError;
    }

    gateStream.off('data', onData);

    res.status(status);
    res.setHeader('Content-Type', 'text/x-component');
    res.setHeader('Vary', 'Accept');

    for (const chunk of bufferedChunks) {
      res.write(chunk);
    }

    if (streamEnded) {
      res.end();
      return;
    }

    gateStream.pipe(res);
  };

  const drainFlightModel = async (model: React.ReactElement): Promise<void> => {
    let capturedError: unknown = null;
    const sink = new PassThrough();
    const completion = new Promise<void>((resolve, reject) => {
      sink.on('data', () => {});
      sink.once('end', resolve);
      sink.once('error', reject);
    });

    const stream = flightServer.renderToPipeableStream(model, flightManifest, {
      onError(error) {
        if (!capturedError) {
          capturedError = error;
        }
      },
    });

    stream.pipe(sink);
    await completion;

    if (capturedError) {
      throw capturedError;
    }
  };

  const resolveActionModulePath = (actionId: string): string => {
    const hashIdx = actionId.lastIndexOf('#');
    const modulePath = hashIdx >= 0 ? actionId.slice(0, hashIdx) : actionId;

    if (!modulePath.startsWith('file://')) {
      return modulePath;
    }

    try {
      return fileURLToPath(modulePath);
    } catch {
      let fallbackPath = modulePath.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
      if (process.platform === 'win32' && /^[a-zA-Z]:/.test(fallbackPath) === false) {
        fallbackPath = '/' + fallbackPath;
      }
      return fallbackPath;
    }
  };

  const primeInlineActionRegistration = async (
    req: express.Request,
    actionId: string
  ): Promise<Function | undefined> => {
    const actionEntry = serverManifest.serverActions?.[actionId];
    if (!actionEntry || actionEntry.kind !== 'inline') {
      return undefined;
    }

    const pathname = req.path.replace(/^\/(?:_rsc|rsc)/, '') || '/';
    const searchParams = getSearchParamsFromRequest(req);
    const actionRoute =
      matchRoute(pathname, serverManifest.routes) ||
      serverManifest.routes.find((candidate) => {
        const targetPath = path.resolve(actionEntry.filePath);
        return (
          path.resolve(candidate.pagePath) === targetPath ||
          candidate.layoutPaths.some((layoutPath) => path.resolve(layoutPath) === targetPath)
        );
      }) ||
      null;

    const resolvedActionPath = path.resolve(actionEntry.filePath || resolveActionModulePath(actionId));
    const routeParams = actionRoute ? extractParams(pathname, actionRoute) : {};

    if (isDev) {
      try {
        delete require.cache[require.resolve(resolvedActionPath)];
      } catch {
        // ignore missing cache entries
      }
    }

    const actionModule = require(resolvedActionPath);
    if (typeof actionModule?.default === 'function') {
      const probeProps: Record<string, unknown> = {
        params: routeParams,
        searchParams,
      };

      if (actionRoute && path.resolve(actionRoute.pagePath) !== resolvedActionPath) {
        probeProps.children = null;
      }

      try {
        await actionModule.default(probeProps);
      } catch {
        // Some components require a fuller tree to evaluate. Fall through to route priming.
      }

      const directResolution = resolveRegisteredServerReference(actionId);
      if (directResolution) {
        return directResolution;
      }
    }

    if (actionRoute) {
      const params = routeParams;
      const model = await createRouteElement(
        actionRoute,
        { pathname, params, searchParams, req },
        isDev,
        runtimeRoot
      );
      await drainFlightModel(model);
      return resolveRegisteredServerReference(actionId);
    }

    return undefined;
  };

  const handleRSCRequest = async (req: express.Request, res: express.Response) => {
    const pathname = req.path.replace(/^\/(?:_rsc|rsc)/, '') || '/';

    await runWithRequestContext(
      {
        req,
        res,
        cwd: runtimeRoot,
        vistaDirRoot,
        urlPath: pathname,
      },
      async () => {
        try {
          // In dev mode, reload manifests from disk on each request so we
          // always pick up the latest output from ReactFlightWebpackPlugin.
          if (isDev) {
            try {
              serverManifest = JSON.parse(
                fs.readFileSync(serverManifestPath, 'utf-8')
              ) as ServerManifest;
              flightManifest = normalizeReactClientReferenceManifest(
                JSON.parse(fs.readFileSync(flightManifestPath, 'utf-8'))
              );
            } catch {
              // Manifests may be mid-write; use whatever we have cached.
            }
          }

          const route = matchRoute(pathname, serverManifest.routes);
          setCurrentSegmentConfig(route?.segmentConfig);
          if (!route) {
            const rootLayout = resolveRootLayout(runtimeRoot, isDev);
            const resolvedNotFound = resolveNotFoundComponent(runtimeRoot, rootLayout, isDev);

            let model: React.ReactElement;
            if (resolvedNotFound) {
              const notFoundElement = React.createElement(resolvedNotFound.component, {
                params: {},
                searchParams: {},
              }) as React.ReactElement;
              model = React.createElement(
                rootLayout.component,
                { params: {}, searchParams: {} },
                notFoundElement
              ) as React.ReactElement;
            } else {
              model = React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    background: '#0a0a0a',
                    color: '#ededed',
                    margin: 0,
                    overflow: 'hidden',
                    textAlign: 'center',
                    userSelect: 'none',
                  },
                },
                React.createElement(
                  'span',
                  {
                    style: {
                      fontSize: '6rem',
                      fontWeight: 800,
                      letterSpacing: '-0.04em',
                      lineHeight: 1,
                      background: 'linear-gradient(135deg, #7c3aed, #2563eb, #06b6d4)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    },
                  },
                  '404'
                ),
                React.createElement(
                  'p',
                  {
                    style: {
                      marginTop: '0.75rem',
                      fontSize: '0.95rem',
                      fontWeight: 400,
                      color: '#555',
                      letterSpacing: '0.02em',
                    },
                  },
                  "There's nothing here."
                )
              );
            }

            await pipeFlightModel(res, model, 404);
            return;
          }

          const params = extractParams(pathname, route);
          const searchParams = getSearchParamsFromRequest(req);
          const element = await createRouteElement(
            route,
            { pathname, params, searchParams, req },
            isDev,
            runtimeRoot
          );

          await pipeFlightModel(res, element, 200);
        } catch (error) {
          if ((error as any)?.name === 'NotFoundError') {
            try {
              const rootLayout = resolveRootLayout(runtimeRoot, isDev);
              const route = matchRoute(pathname, serverManifest.routes);
              setCurrentSegmentConfig(route?.segmentConfig);
              if (route) {
                const segmentNotFoundPath = resolveNearestSegmentNotFoundPath(
                  path.join(runtimeRoot, 'app'),
                  route.routeDir
                );
                if (segmentNotFoundPath) {
                  const params = extractParams(pathname, route);
                  const searchParams = getSearchParamsFromRequest(req);
                  const model = await createRouteElement(
                    {
                      ...route,
                      pagePath: segmentNotFoundPath,
                    },
                    { pathname, params, searchParams, req },
                    isDev,
                    runtimeRoot,
                    { disableParallelSlots: true }
                  );

                  await pipeFlightModel(res, model, 404);
                  return;
                }
              }
              const resolvedNotFound = resolveNotFoundComponent(runtimeRoot, rootLayout, isDev);

              let model: React.ReactElement;
              if (resolvedNotFound) {
                const notFoundElement = React.createElement(resolvedNotFound.component, {
                  params: {},
                  searchParams: {},
                }) as React.ReactElement;
                model = React.createElement(
                  rootLayout.component,
                  { params: {}, searchParams: {} },
                  notFoundElement
                ) as React.ReactElement;
              } else {
                model = React.createElement('h1', null, '404 - Page Not Found');
              }

              await pipeFlightModel(res, model, 404);
              return;
            } catch (notFoundError) {
              console.error('[vista:rsc] Failed to render NotFoundError fallback:', notFoundError);
            }
          }
          console.error('[vista:rsc] Upstream request failed:', error);
          res
            .status(500)
            .type('text/plain')
            .send((error as Error).message);
        }
      }
    );
  };

  app.get(/^\/rsc/, handleRSCRequest);
  app.get(/^\/_rsc/, handleRSCRequest);

  // -----------------------------------------------------------------------
  // Server Actions — POST handler
  // -----------------------------------------------------------------------
  app.use(express.text({ type: 'text/plain', limit: '10mb' }));

  const handleServerAction = async (req: express.Request, res: express.Response) => {
    const pathname = req.path.replace(/^\/(?:_rsc|rsc)/, '') || '/';

    await runWithRequestContext(
      {
        req,
        res,
        cwd: runtimeRoot,
        vistaDirRoot,
        urlPath: pathname,
      },
      async () => {
        try {
          const actionId = req.headers['rsc-action'] as string | undefined;
          if (!actionId) {
            res.status(400).type('text/plain').send('Missing rsc-action header');
            return;
          }

          if (isDev) {
            try {
              serverManifest = JSON.parse(
                fs.readFileSync(serverManifestPath, 'utf-8')
              ) as ServerManifest;
              flightManifest = JSON.parse(fs.readFileSync(flightManifestPath, 'utf-8'));
            } catch {
              // Keep cached manifests if they're being rewritten.
            }
          }

          setCurrentSegmentConfig(matchRoute(pathname, serverManifest.routes)?.segmentConfig);
          let actionFn = resolveRegisteredServerReference(actionId);
          if (!actionFn) {
            actionFn = await primeInlineActionRegistration(req, actionId);
          }

          if (!actionFn) {
            const hashIdx = actionId.lastIndexOf('#');
            const exportName = hashIdx >= 0 ? actionId.slice(hashIdx + 1) : 'default';
            const resolvedPath = resolveActionModulePath(actionId);

            if (isDev) {
              try {
                delete require.cache[require.resolve(resolvedPath)];
              } catch {
                // ignore missing cache entries
              }
            }

            const actionModule = require(resolvedPath);
            actionFn = actionModule[exportName];
          }

          if (typeof actionFn !== 'function') {
            res.status(404).type('text/plain').send(`Server action not found: ${actionId}`);
            return;
          }

          const rawBody = await readRawRequestBody(req);
          const contentType = String(req.headers['content-type'] || '');

          let result: unknown;
          if (contentType.includes('multipart/form-data')) {
            const formData = await parseMultipartFormData(req, rawBody);
            const boundAction = await flightServer.decodeAction(formData, flightManifest);
            result = await boundAction();
          } else {
            const args = (await flightServer.decodeReply(rawBody.toString('utf-8'), flightManifest)) as unknown[];
            result = await actionFn(...(Array.isArray(args) ? args : [args]));
          }

          const revalidatedPaths = consumeRevalidatedPaths();
          if (revalidatedPaths.length > 0) {
            res.setHeader('x-vista-revalidated-paths', JSON.stringify(revalidatedPaths));
          }

          const revalidatedTags = consumeRevalidatedTags();
          if (revalidatedTags.length > 0) {
            res.setHeader('x-vista-revalidated-tags', JSON.stringify(revalidatedTags));
          }

          res.setHeader('Content-Type', 'text/x-component');
          const stream = flightServer.renderToPipeableStream(
            result as React.ReactNode,
            flightManifest,
            {
              onError(error) {
                console.error('[vista:rsc] Server action render error:', error);
              },
            }
          );
          stream.pipe(res);
        } catch (error) {
          console.error('[vista:rsc] Server action failed:', error);
          res
            .status(500)
            .type('text/plain')
            .send((error as Error).message);
        }
      }
    );
  };

  app.post(/^\/rsc/, handleServerAction);
  app.post(/^\/_rsc/, handleServerAction);

  const server = app.listen(port, () => {
    console.log(`[vista:rsc:upstream] Listening on http://127.0.0.1:${port}/rsc`);
  });

  server.on('error', (error: any) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(`[vista:server] Port ${port} is already in use.`);
      process.exit(1);
      return;
    }
    console.error('[vista:server] RSC upstream startup failed:', error);
    process.exit(1);
  });
}

startUpstream();
