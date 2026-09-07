import fs from 'fs';
import path from 'path';
import type express from 'express';
import {
  executeRoute,
  StackMethodNotAllowedError,
  StackRouteNotFoundError,
  StackValidationError,
  type ProcedureRecord,
  type StackRouter,
} from '../stack/server';
import type { ResolvedTypedApiConfig } from '../config';
import { mergeSegmentConfigs, parseSegmentConfig, type ResolvedSegmentConfig } from './segment-config';
import { setCurrentSegmentConfig } from './request-context';

type TypedApiRouter = StackRouter<ProcedureRecord, any, any>;
type RouteRuntimeMode = 'nodejs' | 'edge' | 'experimental-edge';
type MetadataRouteMapping = {
  requestPath: string;
  stem: string;
};

const TYPED_API_ENTRYPOINTS = [
  path.join('app', 'api', 'typed.ts'),
  path.join('app', 'api', 'typed.tsx'),
  path.join('app', 'api', 'typed.js'),
  path.join('app', 'api', 'typed.jsx'),
  path.join('app', 'typed-api.ts'),
  path.join('app', 'typed-api.tsx'),
  path.join('app', 'typed-api.js'),
  path.join('app', 'typed-api.jsx'),
];

const METADATA_ROUTE_MAPPINGS: MetadataRouteMapping[] = [
  { requestPath: '/robots.txt', stem: 'robots' },
  { requestPath: '/sitemap.xml', stem: 'sitemap' },
  { requestPath: '/manifest.webmanifest', stem: 'manifest' },
];

const ROUTE_FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;

class BodyLimitError extends Error {
  status = 413;

  constructor(limitBytes: number) {
    super(`Typed API body exceeds configured limit (${limitBytes} bytes)`);
    this.name = 'BodyLimitError';
  }
}

class BodyParseError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'BodyParseError';
  }
}

type TypedRouteResult =
  | { kind: 'handled'; status: number; payload: unknown }
  | { kind: 'method-not-allowed'; status: 405; error: string }
  | { kind: 'not-found' };

function isStackRouterLike(value: unknown): value is TypedApiRouter {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TypedApiRouter>;
  return (
    !!candidate.procedures &&
    !!candidate.routes &&
    !!candidate.metadata &&
    typeof candidate.resolve === 'function'
  );
}

function resolveTypedRouterFromModule(mod: any): TypedApiRouter | null {
  const candidates = [
    mod?.default,
    mod?.router,
    mod?.typedRouter,
    mod?.api,
    typeof mod?.createRouter === 'function' ? mod.createRouter() : null,
    typeof mod?.createTypedRouter === 'function' ? mod.createTypedRouter() : null,
  ];

  for (const candidate of candidates) {
    if (isStackRouterLike(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeApiPath(pathname: string): string {
  if (!pathname.startsWith('/api')) {
    return pathname || '/';
  }

  const stripped = pathname.slice('/api'.length);
  return stripped ? stripped : '/';
}

function buildPathCandidates(pathname: string): string[] {
  const normalized = pathname || '/';
  const apiNormalized = normalizeApiPath(normalized);
  const dedup = new Set<string>([normalized, apiNormalized]);
  return Array.from(dedup);
}

function normalizeRouteRequestPath(requestPath: string): string {
  const normalized = String(requestPath || '/').split('?')[0].replace(/\\/g, '/');
  if (normalized === '/' || normalized === '') {
    return '';
  }
  return normalized.replace(/^\/+/, '').replace(/\/+$/, '');
}

function isRouteGroupDirectory(name: string): boolean {
  return /^\([\w-]+\)$/.test(name);
}

function resolveMetadataRoutePath(cwd: string, stem: string): string | null {
  const appDir = path.resolve(cwd, 'app');

  const tryStemInDirectory = (dir: string): string | null => {
    for (const extension of ROUTE_FILE_EXTENSIONS) {
      const candidate = path.join(dir, `${stem}${extension}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  const directMatch = tryStemInDirectory(appDir);
  if (directMatch) {
    return directMatch;
  }

  const searchGroupDirectories = (dir: string): string | null => {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isRouteGroupDirectory(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const groupDir = path.join(dir, entry.name);
      const match = tryStemInDirectory(groupDir);
      if (match) {
        return match;
      }

      const nestedMatch = searchGroupDirectories(groupDir);
      if (nestedMatch) {
        return nestedMatch;
      }
    }

    return null;
  };

  return searchGroupDirectories(appDir);
}

function hasMethodMatch(router: TypedApiRouter, pathname: string, method: string): boolean {
  const normalized = method.toLowerCase();
  return router.resolve(pathname, normalized) !== null;
}

function hasRouteForAnyMethod(router: TypedApiRouter, pathname: string): boolean {
  return hasMethodMatch(router, pathname, 'get') || hasMethodMatch(router, pathname, 'post');
}

async function parseRequestBody(req: express.Request, bodySizeLimitBytes: number): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > bodySizeLimitBytes) {
      throw new BodyLimitError(bodySizeLimitBytes);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const raw = Buffer.concat(chunks);
  const contentType = String(req.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!contentType || contentType === 'application/json' || contentType.endsWith('+json')) {
    try {
      return JSON.parse(raw.toString('utf-8'));
    } catch {
      throw new BodyParseError('Invalid JSON body for typed API request.');
    }
  }

  if (contentType === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(raw.toString('utf-8')).entries());
  }

  if (contentType.startsWith('text/')) {
    return raw.toString('utf-8');
  }

  return raw;
}

async function sendFetchResponse(res: express.Response, response: Response): Promise<void> {
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const arrayBuffer = await response.arrayBuffer();
  const body = Buffer.from(arrayBuffer);
  res.status(response.status).send(body);
}

function applyRuntimeTraceHeaders(
  res: express.Response,
  segmentConfig: ResolvedSegmentConfig,
  mode: 'route-handler' | 'typed-api'
): void {
  res.setHeader('X-Vista-Route-Runtime', segmentConfig.runtime);
  res.setHeader('X-Vista-Advanced-Runtime', mode);
}

function createReadonlyCookieStore(header: string | null) {
  const cookieMap = new Map<string, string>();

  if (header) {
    for (const segment of header.split(';')) {
      const [rawName, ...valueParts] = segment.split('=');
      const name = rawName?.trim();
      if (!name) continue;
      cookieMap.set(name, decodeURIComponent(valueParts.join('=').trim()));
    }
  }

  return {
    get(name: string) {
      const value = cookieMap.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll() {
      return Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }));
    },
    has(name: string) {
      return cookieMap.has(name);
    },
  };
}

async function readRouteRequestBody(req: express.Request): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

function buildRequestUrl(req: express.Request): URL {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost';
  return new URL(req.originalUrl || req.url || req.path || '/', `${protocol}://${host}`);
}

function createRouteRequest(req: express.Request, body: Buffer | undefined): Request & {
  nextUrl: {
    pathname: string;
    searchParams: URLSearchParams;
    href: string;
    origin: string;
  };
  cookies: ReturnType<typeof createReadonlyCookieStore>;
} {
  const requestUrl = buildRequestUrl(req);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, String(entry));
      }
      continue;
    }
    if (value !== undefined) {
      headers.set(key, String(value));
    }
  }

  const requestInit: RequestInit = {
    method: req.method,
    headers,
  };

  if (body !== undefined) {
    requestInit.body = new Uint8Array(body);
  }

  const request = new Request(requestUrl.toString(), requestInit) as Request & {
    nextUrl: {
      pathname: string;
      searchParams: URLSearchParams;
      href: string;
      origin: string;
    };
    cookies: ReturnType<typeof createReadonlyCookieStore>;
  };

  Object.defineProperty(request, 'nextUrl', {
    configurable: true,
    enumerable: true,
    value: {
      pathname: requestUrl.pathname,
      searchParams: requestUrl.searchParams,
      href: requestUrl.href,
      origin: requestUrl.origin,
    },
  });

  Object.defineProperty(request, 'cookies', {
    configurable: true,
    enumerable: true,
    value: createReadonlyCookieStore(headers.get('cookie')),
  });

  return request;
}

function resolveRouteSegmentRuntime(
  apiPath: string,
  apiModule: any
): ResolvedSegmentConfig {
  let parsedSourceConfig = {};

  try {
    const source = fs.readFileSync(apiPath, 'utf-8');
    parsedSourceConfig = parseSegmentConfig(source, apiPath).config;
  } catch {
    parsedSourceConfig = {};
  }

  const runtimeValue =
    typeof apiModule?.runtime === 'string' ? apiModule.runtime : (parsedSourceConfig as any).runtime;

  return mergeSegmentConfigs([
    {
      absolutePath: apiPath,
      segmentConfig: {
        ...(parsedSourceConfig as any),
        ...(runtimeValue ? { runtime: runtimeValue as RouteRuntimeMode } : {}),
      },
    },
  ]);
}

function isEdgeRuntime(runtime: RouteRuntimeMode): boolean {
  return runtime === 'edge' || runtime === 'experimental-edge';
}

function getTypedApiEntrypoint(cwd: string): string | null {
  for (const relativePath of TYPED_API_ENTRYPOINTS) {
    const absolutePath = path.resolve(cwd, relativePath);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }
  return null;
}

async function executeTypedRoute(
  router: TypedApiRouter,
  options: {
    req: express.Request;
    method: string;
    query: Record<string, unknown>;
    body: unknown;
    serialization: ResolvedTypedApiConfig['serialization'];
    context: Record<string, unknown>;
    env: unknown;
  }
): Promise<TypedRouteResult> {
  const pathCandidates = buildPathCandidates(options.req.path);
  const method = options.method.toLowerCase();

  let selectedPath: string | null = null;
  let routeExistsForDifferentMethod = false;

  for (const candidate of pathCandidates) {
    if (hasMethodMatch(router, candidate, method)) {
      selectedPath = candidate;
      break;
    }

    if (hasRouteForAnyMethod(router, candidate)) {
      routeExistsForDifferentMethod = true;
    }
  }

  if (!selectedPath) {
    if (routeExistsForDifferentMethod) {
      return {
        kind: 'method-not-allowed',
        status: 405,
        error: `Method ${method.toUpperCase()} not allowed`,
      };
    }
    return { kind: 'not-found' };
  }

  const result = await executeRoute(router, {
    path: selectedPath,
    method,
    req: {
      method,
      path: selectedPath,
      query: options.query,
      body: options.body,
      headers: options.req.headers as Record<string, string | string[] | undefined>,
      originalUrl: options.req.originalUrl,
      url: options.req.url,
    },
    ctx: options.context,
    env: options.env,
    serialization: options.serialization,
  });

  return {
    kind: 'handled',
    status: 200,
    payload: result.serializedData,
  };
}

const ROUTE_HANDLER_FILENAMES = ROUTE_FILE_EXTENSIONS.map((ext) => `route${ext}`);

export type LegacyRouteHandlerMatch = {
  filePath: string;
  params: Record<string, string>;
};

function isRouteGroupSegment(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')');
}

type RouteHandlerScan = {
  files: string[];
  scannedAt: number;
};

// `resolveLegacyRouteHandlerMatch` runs for every request without an exact
// `route.*` match (pages included), so the recursive `app/` walk is cached per
// app directory. Production apps never change on disk, so the scan is kept for
// the life of the process; dev re-scans on a short TTL to pick up new files.
const routeHandlerScanCache = new Map<string, RouteHandlerScan>();
const ROUTE_HANDLER_SCAN_TTL_MS = process.env.NODE_ENV === 'production' ? Infinity : 500;

function getRouteHandlerFiles(appDir: string): string[] {
  const cached = routeHandlerScanCache.get(appDir);
  if (cached && Date.now() - cached.scannedAt < ROUTE_HANDLER_SCAN_TTL_MS) {
    return cached.files;
  }

  const files: string[] = [];
  collectRouteHandlerFiles(appDir, files);
  routeHandlerScanCache.set(appDir, { files, scannedAt: Date.now() });
  return files;
}

function collectRouteHandlerFiles(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRouteHandlerFiles(fullPath, results);
      continue;
    }
    if (entry.isFile() && ROUTE_HANDLER_FILENAMES.includes(entry.name)) {
      results.push(fullPath);
    }
  }
}

function filePathToHandlerPattern(appDir: string, filePath: string): string {
  const relativeDir = path.relative(appDir, path.dirname(filePath)).replace(/\\/g, '/');
  const segments = relativeDir.split('/').filter(Boolean).filter((segment) => !isRouteGroupSegment(segment));
  if (segments.length === 0) return '/';

  const patterned = segments.map((segment) => {
    if (segment.startsWith('[[...') && segment.endsWith(']]')) {
      return `:${segment.slice(4, -2)}*?`;
    }
    if (segment.startsWith('[...') && segment.endsWith(']')) {
      return `:${segment.slice(4, -1)}*`;
    }
    if (segment.startsWith('[') && segment.endsWith(']')) {
      return `:${segment.slice(1, -1)}`;
    }
    return segment;
  });

  return `/${patterned.join('/')}`;
}

function matchHandlerPattern(
  pathname: string,
  pattern: string
): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.endsWith('*?')) {
      const name = patternPart.slice(1, -2);
      params[name] = pathParts.slice(i).join('/');
      return params;
    }

    if (patternPart.endsWith('*')) {
      if (pathParts.length < i + 1) return null;
      const name = patternPart.slice(1, -1);
      params[name] = pathParts.slice(i).join('/');
      return params;
    }

    if (patternPart.startsWith(':')) {
      if (!pathPart) return null;
      params[patternPart.slice(1)] = pathPart;
      continue;
    }

    if (patternPart !== pathPart) return null;
  }

  return patternParts.length === pathParts.length ? params : null;
}

function handlerSpecificity(pattern: string): number {
  const parts = pattern.split('/').filter(Boolean);
  let score = parts.length * 10;
  for (const part of parts) {
    if (part.endsWith('*?')) score -= 3;
    else if (part.endsWith('*')) score -= 2;
    else if (part.startsWith(':')) score -= 1;
  }
  return score;
}

export function resolveLegacyApiRoutePath(cwd: string, requestPath: string): string | null {
  if (!requestPath.startsWith('/api/')) {
    return null;
  }
  return resolveLegacyRouteHandlerPath(cwd, requestPath);
}

export function resolveLegacyRouteHandlerMatch(
  cwd: string,
  requestPath: string
): LegacyRouteHandlerMatch | null {
  const exactPath = resolveExactLegacyRouteHandlerPath(cwd, requestPath);
  if (exactPath) {
    return { filePath: exactPath, params: {} };
  }

  const appDir = path.resolve(cwd, 'app');
  const handlers = getRouteHandlerFiles(appDir);

  const pathname = `/${normalizeRouteRequestPath(requestPath)}`;
  const matches: Array<LegacyRouteHandlerMatch & { score: number }> = [];

  for (const filePath of handlers) {
    const pattern = filePathToHandlerPattern(appDir, filePath);
    const params = matchHandlerPattern(pathname, pattern);
    if (params) {
      matches.push({ filePath, params, score: handlerSpecificity(pattern) });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches[0] ? { filePath: matches[0].filePath, params: matches[0].params } : null;
}

export function resolveLegacyRouteHandlerPath(cwd: string, requestPath: string): string | null {
  return resolveLegacyRouteHandlerMatch(cwd, requestPath)?.filePath ?? null;
}

function resolveExactLegacyRouteHandlerPath(cwd: string, requestPath: string): string | null {
  const normalized = normalizeRouteRequestPath(requestPath);
  const routeCandidates: string[] = [];

  const metadataRoute = METADATA_ROUTE_MAPPINGS.find(
    (entry) => entry.requestPath === String(requestPath || '').split('?')[0]
  );
  if (metadataRoute) {
    const resolvedMetadataPath = resolveMetadataRoutePath(cwd, metadataRoute.stem);
    if (resolvedMetadataPath) {
      routeCandidates.push(resolvedMetadataPath);
    }
  }

  if (normalized.startsWith('api/')) {
    const apiRoute = normalized.slice('api/'.length);
    routeCandidates.push(
      path.resolve(cwd, 'app', 'api', apiRoute, 'route.ts'),
      path.resolve(cwd, 'app', 'api', apiRoute, 'route.tsx'),
      path.resolve(cwd, 'app', 'api', apiRoute, 'route.js'),
      path.resolve(cwd, 'app', 'api', apiRoute, 'route.jsx'),
      path.resolve(cwd, 'app', 'api', `${apiRoute}.ts`),
      path.resolve(cwd, 'app', 'api', `${apiRoute}.tsx`),
      path.resolve(cwd, 'app', 'api', `${apiRoute}.js`),
      path.resolve(cwd, 'app', 'api', `${apiRoute}.jsx`)
    );
  }

  routeCandidates.push(
    path.resolve(cwd, 'app', normalized, 'route.ts'),
    path.resolve(cwd, 'app', normalized, 'route.tsx'),
    path.resolve(cwd, 'app', normalized, 'route.js'),
    path.resolve(cwd, 'app', normalized, 'route.jsx')
  );

  for (const routePath of routeCandidates) {
    if (fs.existsSync(routePath)) {
      return routePath;
    }
  }

  return null;
}

export async function runLegacyApiRoute(options: {
  req: express.Request;
  res: express.Response;
  apiPath: string;
  isDev: boolean;
  params?: Record<string, string>;
}): Promise<void> {
  const { req, res, apiPath, isDev, params = {} } = options;

  if (isDev) {
    delete require.cache[require.resolve(apiPath)];
  }

  const apiModule = require(apiPath);
  const resolvedSegmentConfig = resolveRouteSegmentRuntime(apiPath, apiModule);
  setCurrentSegmentConfig(resolvedSegmentConfig);
  const runtime = resolvedSegmentConfig.runtime;
  applyRuntimeTraceHeaders(res, resolvedSegmentConfig, 'route-handler');
  const method = req.method?.toUpperCase() || 'GET';
  const methodHandler = apiModule[method];

  if (typeof methodHandler === 'function') {
    const requestBody = await readRouteRequestBody(req);
    const request = createRouteRequest(req, requestBody);

    const result = await methodHandler(request, { params });
    if (result instanceof Response) {
      await sendFetchResponse(res, result);
      return;
    }

    if (result !== undefined) {
      res.status(200).json(result);
      return;
    }

    res.status(204).end();
    return;
  }

  if (isEdgeRuntime(runtime) && typeof apiModule.default === 'function') {
    res.status(500).json({
      error: 'Edge runtime route handlers must export HTTP method functions instead of a default Express handler.',
    });
    return;
  }

  if (typeof apiModule.default === 'function') {
    apiModule.default(req, res);
    return;
  }

  res.status(405).json({ error: `Method ${method} not allowed` });
}

export async function runTypedApiRoute(options: {
  req: express.Request;
  res: express.Response;
  cwd: string;
  isDev: boolean;
  config: ResolvedTypedApiConfig;
}): Promise<boolean> {
  const { req, res, cwd, isDev, config } = options;

  if (!config.enabled) {
    return false;
  }

  const entrypoint = getTypedApiEntrypoint(cwd);
  if (!entrypoint) {
    return false;
  }

  try {
    if (isDev) {
      delete require.cache[require.resolve(entrypoint)];
    }

    const typedModule = require(entrypoint);
    const router = resolveTypedRouterFromModule(typedModule);
    const resolvedSegmentConfig = resolveRouteSegmentRuntime(entrypoint, typedModule);
    setCurrentSegmentConfig(resolvedSegmentConfig);
    applyRuntimeTraceHeaders(res, resolvedSegmentConfig, 'typed-api');

    if (!router) {
      res.status(500).json({
        error: `Typed API entrypoint "${path.relative(cwd, entrypoint)}" does not export a valid stack router.`,
      });
      return true;
    }

    const method = (req.method || 'GET').toUpperCase();
    const body = await parseRequestBody(req, config.bodySizeLimitBytes);
    const query = (req.query ?? {}) as Record<string, unknown>;

    const contextFactory =
      typeof typedModule.createContext === 'function' ? typedModule.createContext : null;
    const envFactory = typeof typedModule.createEnv === 'function' ? typedModule.createEnv : null;

    const context = contextFactory ? await contextFactory({ req, res }) : {};
    const env = envFactory ? await envFactory({ req, res }) : {};

    const routeResult = await executeTypedRoute(router, {
      req,
      method,
      query,
      body,
      serialization: config.serialization,
      context: context ?? {},
      env,
    });

    if (routeResult.kind === 'not-found') {
      return false;
    }

    if (routeResult.kind === 'method-not-allowed') {
      res.status(routeResult.status).json({ error: routeResult.error });
      return true;
    }

    res.status(routeResult.status).json(routeResult.payload);
    return true;
  } catch (error) {
    const typedError = error as any;

    if (typedError instanceof BodyLimitError || typedError instanceof BodyParseError) {
      res.status(typedError.status).json({ error: typedError.message });
      return true;
    }

    if (
      typedError instanceof StackValidationError ||
      typedError instanceof StackMethodNotAllowedError
    ) {
      const status = typeof typedError.status === 'number' ? typedError.status : 400;
      res.status(status).json({ error: typedError.message });
      return true;
    }

    if (typedError instanceof StackRouteNotFoundError) {
      return false;
    }

    // Router-level error handler gets first chance.
    try {
      const entrypoint = getTypedApiEntrypoint(cwd);
      if (entrypoint) {
        if (isDev) {
          delete require.cache[require.resolve(entrypoint)];
        }

        const typedModule = require(entrypoint);
        const router = resolveTypedRouterFromModule(typedModule);
        const errorHandler = router?.metadata?.errorHandler;
        if (typeof errorHandler === 'function') {
          const response = errorHandler(error, {
            method: req.method,
            path: req.path,
            query: (req.query ?? {}) as Record<string, unknown>,
            headers: req.headers as Record<string, string | string[] | undefined>,
          });
          if (response instanceof Response) {
            await sendFetchResponse(res, response);
            return true;
          }
        }
      }
    } catch {
      // Ignore fallback handler errors and use generic 500 response below.
    }

    res.status(500).json({ error: 'Internal Server Error in Typed API' });
    return true;
  }
}
