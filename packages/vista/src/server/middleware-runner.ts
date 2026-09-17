/**
 * Vista Middleware Runner
 *
 * Built-in middleware system for Vista.js.
 * Supports:
 *  1. Global middleware (top-level middleware.ts / middleware.js at cwd or src/)
 *  2. Route-specific middleware (co-located in app/ directory segments, e.g. app/api/auth/middleware.ts)
 *  3. Exported middleware from route files (e.g. export const middleware = ... in page.tsx or route.ts)
 *  4. Middleware signature: middleware({ request, next }) matching Issue #7 Part 5
 *  5. Middleware chaining and clearly defined execution order:
 *     Global -> Segment middlewares (shallowest to deepest) -> Route-level middleware -> Handler
 *  6. Request modification (headers, URL rewrites) and Response modification / short-circuiting
 */

import path from 'path';
import fs from 'fs';
import type { Request, Response as ExpressResponse } from 'express';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiddlewareResult {
  /** 'redirect' — send Location header and status; 'short-circuit' — send custom status/body; 'rewrite' — rewrite URL; 'next' — continue; 'skip' — no middleware matched */
  kind: 'redirect' | 'rewrite' | 'next' | 'short-circuit' | 'skip';
  /** HTTP status (e.g. 307 for redirect, 401/403 for short-circuit) */
  status?: number;
  /** Redirect target URL or rewrite path */
  location?: string;
  /** Extra response headers the middleware set (forwarded to client) */
  responseHeaders?: Map<string, string>;
  /** Extra request headers modified by middleware (forwarded to downstream handlers) */
  requestHeaders?: Map<string, string>;
  /** Response body when short-circuiting */
  body?: string | Buffer | null;
}

/** The Request-like object handed to middleware. */
export interface VistaMiddlewareRequest {
  url: string;
  method: string;
  path: string;
  headers: Headers;
  nextUrl: {
    pathname: string;
    searchParams: URLSearchParams;
    href: string;
    origin: string;
  };
  cookies: {
    get: (name: string) => { name: string; value: string } | undefined;
    getAll: () => Array<{ name: string; value: any }>;
    has: (name: string) => boolean;
  };
  [key: string]: any;
}

export type NextFunction = (options?: {
  request?: {
    headers?: Headers | Record<string, string>;
  };
}) => Promise<Response>;

export interface VistaMiddlewareContext {
  request: VistaMiddlewareRequest;
  next: NextFunction;
  url?: string;
  method?: string;
  headers?: Headers;
  nextUrl?: VistaMiddlewareRequest['nextUrl'];
  cookies?: VistaMiddlewareRequest['cookies'];
  [key: string]: any;
}

export type MiddlewareFunction = (
  contextOrRequest: VistaMiddlewareContext | VistaMiddlewareRequest,
  nextFn?: NextFunction
) => Promise<Response | MiddlewareResult | void> | Response | MiddlewareResult | void;

export interface MiddlewareConfig {
  matcher?: string | string[];
}

export interface MiddlewareModule {
  default?: MiddlewareFunction;
  middleware?: MiddlewareFunction;
  config?: MiddlewareConfig;
  [key: string]: any;
}

interface DiscoveredMiddlewareEntry {
  source: 'global' | 'segment' | 'route';
  filePath: string;
  depth: number;
  middlewareFn?: MiddlewareFunction;
  config?: MiddlewareConfig;
}

// ---------------------------------------------------------------------------
// Discovery Caches
// ---------------------------------------------------------------------------

const globalDiscoveryCache = new Map<string, string | null>();
const routeDiscoveryCache = new Map<string, string[]>();

const MIDDLEWARE_FILE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const ROUTE_FILE_STEMS = ['page', 'route', 'index', 'layout'];

export function clearMiddlewareCaches(): void {
  globalDiscoveryCache.clear();
  routeDiscoveryCache.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAppDir(cwd: string): string | null {
  const candidates = [path.join(cwd, 'app'), path.join(cwd, 'src', 'app')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

/**
 * Discover top-level global middleware.
 * Checks `<cwd>/middleware.*` then `<cwd>/src/middleware.*`.
 */
export function discoverGlobalMiddleware(cwd: string, bustCache: boolean): string | null {
  if (!bustCache && globalDiscoveryCache.has(cwd)) {
    return globalDiscoveryCache.get(cwd)!;
  }

  const searchDirs = [cwd, path.join(cwd, 'src')];
  for (const dir of searchDirs) {
    for (const ext of MIDDLEWARE_FILE_EXTS) {
      const candidate = path.join(dir, `middleware${ext}`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        globalDiscoveryCache.set(cwd, candidate);
        return candidate;
      }
    }
  }

  globalDiscoveryCache.set(cwd, null);
  return null;
}

/**
 * Discover route-specific middleware files along the path hierarchy.
 * Returns file paths from shallowest segment to deepest segment.
 */
export function discoverRouteMiddlewares(cwd: string, pathname: string, bustCache: boolean): string[] {
  const cacheKey = `${cwd}:${pathname}`;
  if (!bustCache && routeDiscoveryCache.has(cacheKey)) {
    return routeDiscoveryCache.get(cacheKey)!;
  }

  const appDir = getAppDir(cwd);
  if (!appDir) {
    routeDiscoveryCache.set(cacheKey, []);
    return [];
  }

  const globalMiddleware = discoverGlobalMiddleware(cwd, bustCache);
  const results: string[] = [];

  // 1. Check app/middleware.* (if different from global middleware)
  for (const ext of MIDDLEWARE_FILE_EXTS) {
    const appLevel = path.join(appDir, `middleware${ext}`);
    if (fs.existsSync(appLevel) && fs.statSync(appLevel).isFile() && appLevel !== globalMiddleware) {
      results.push(appLevel);
      break;
    }
  }

  // 2. Traverse route segments from root to leaf
  const segments = pathname.split('/').filter(Boolean);
  let currentDir = appDir;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    let nextDir: string | null = null;

    // Direct segment match (e.g. app/api)
    const exactDir = path.join(currentDir, seg);
    if (fs.existsSync(exactDir) && fs.statSync(exactDir).isDirectory()) {
      nextDir = exactDir;
    } else {
      // Dynamic route segment match (e.g. [id], [...slug])
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        const dynamicEntry = entries.find(
          (e) =>
            e.isDirectory() &&
            e.name.startsWith('[') &&
            e.name.endsWith(']') &&
            e.name !== '[not-found]'
        );
        if (dynamicEntry) {
          nextDir = path.join(currentDir, dynamicEntry.name);
        }
      } catch {
        // Ignore read errors
      }
    }

    if (!nextDir) {
      break;
    }

    currentDir = nextDir;

    // Check for co-located middleware in this segment directory
    for (const ext of MIDDLEWARE_FILE_EXTS) {
      const segmentMiddleware = path.join(currentDir, `middleware${ext}`);
      if (
        fs.existsSync(segmentMiddleware) &&
        fs.statSync(segmentMiddleware).isFile() &&
        segmentMiddleware !== globalMiddleware &&
        !results.includes(segmentMiddleware)
      ) {
        results.push(segmentMiddleware);
        break;
      }
    }
  }

  // 3. At leaf directory, check for exported middleware in route files (page.tsx, route.ts, etc.)
  for (const stem of ROUTE_FILE_STEMS) {
    for (const ext of MIDDLEWARE_FILE_EXTS) {
      const candidateRouteFile = path.join(currentDir, `${stem}${ext}`);
      if (
        fs.existsSync(candidateRouteFile) &&
        fs.statSync(candidateRouteFile).isFile() &&
        !results.includes(candidateRouteFile)
      ) {
        // Record candidate route file to inspect for exported middleware
        results.push(candidateRouteFile);
      }
    }
  }

  routeDiscoveryCache.set(cacheKey, results);
  return results;
}

// ---------------------------------------------------------------------------
// Matcher Support
// ---------------------------------------------------------------------------

export function patternToRegExp(pattern: string): RegExp {
  // Convert Next.js-style / path pattern to RegExp:
  //   /foo/:path*  → /foo(?:/(.*))?
  //   /foo/:bar    → /foo/[^/]+
  //   /foo/*       → /foo(?:/(.*))?
  let re = pattern
    .replace(/\/:[^/]+\*/g, '(?:/(.*))?') // /:path* (0 or more sub-paths)
    .replace(/:[^/]+\*/g, '(.*)') // bare :path*
    .replace(/:[^/]+/g, '[^/]+') // :param (single segment)
    .replace(/\/\*/g, '(?:/(.*))?') // /*
    .replace(/\*/g, '(.*)'); // bare *

  return new RegExp(`^${re}/?$`);
}

export function shouldRunMiddleware(middlewareModule: MiddlewareModule, pathname: string): boolean {
  const config = middlewareModule.config;
  if (!config?.matcher) return true;

  const matchers: string[] = Array.isArray(config.matcher) ? config.matcher : [config.matcher];

  return matchers.some((pattern) => {
    try {
      const re = patternToRegExp(pattern);
      return re.test(pathname);
    } catch {
      return true;
    }
  });
}

// ---------------------------------------------------------------------------
// Build NextRequest-like Object
// ---------------------------------------------------------------------------

export function buildNextRequest(req: Request): VistaMiddlewareRequest {
  const protocol = req.protocol || 'http';
  const host = (req.get && req.get('host')) || req.headers?.host || 'localhost';
  const rawPath = req.path || (req.url ? req.url.split('?')[0] : '/');
  const fullUrl = `${protocol}://${host}${req.originalUrl || req.url || rawPath}`;

  const headers = new Headers();
  if (req.headers) {
    for (const [key, val] of Object.entries(req.headers)) {
      if (val !== undefined) {
        if (Array.isArray(val)) {
          for (const item of val) {
            headers.append(key, item);
          }
        } else {
          headers.set(key, String(val));
        }
      }
    }
  }

  const queryParams = new URLSearchParams(
    typeof req.query === 'object' && req.query !== null
      ? (req.query as Record<string, string>)
      : {}
  );

  // Cookie helpers
  const rawCookies: Record<string, any> = (req as any).cookies || {};
  if (!Object.keys(rawCookies).length && req.headers?.cookie) {
    for (const pair of String(req.headers.cookie).split(';')) {
      const [k, ...v] = pair.split('=');
      const name = k?.trim();
      if (name) {
        rawCookies[name] = decodeURIComponent(v.join('=').trim());
      }
    }
  }

  return {
    url: fullUrl,
    method: req.method || 'GET',
    path: rawPath,
    headers,
    nextUrl: {
      pathname: rawPath,
      searchParams: queryParams,
      href: fullUrl,
      origin: `${protocol}://${host}`,
    },
    cookies: {
      get: (name: string) =>
        rawCookies[name] !== undefined ? { name, value: String(rawCookies[name]) } : undefined,
      getAll: () =>
        Object.entries(rawCookies).map(([n, v]) => ({
          name: n,
          value: v,
        })),
      has: (name: string) => rawCookies[name] !== undefined,
    },
  };
}

function cloneRequestWithHeaders(
  req: VistaMiddlewareRequest,
  newHeaders: Headers | Record<string, string>
): VistaMiddlewareRequest {
  const mergedHeaders = new Headers(req.headers);
  if (newHeaders instanceof Headers) {
    newHeaders.forEach((val, key) => mergedHeaders.set(key, val));
  } else {
    for (const [k, v] of Object.entries(newHeaders)) {
      mergedHeaders.set(k, String(v));
    }
  }

  return {
    ...req,
    headers: mergedHeaders,
  };
}

// ---------------------------------------------------------------------------
// Execution Pipeline
// ---------------------------------------------------------------------------

function loadModule(filePath: string, isDev: boolean): MiddlewareModule | null {
  try {
    if (isDev) {
      try {
        delete require.cache[require.resolve(filePath)];
      } catch {}
    }
    return require(filePath);
  } catch (err) {
    console.warn(`[vista:middleware] Failed to load middleware module ${filePath}:`, (err as Error)?.message);
    return null;
  }
}

/**
 * Run user-defined middleware chain (global + route-specific) for the given request.
 *
 * Execution Order:
 *  1. Global middleware (cwd/middleware.ts or cwd/src/middleware.ts)
 *  2. Route segment middlewares (from shallowest to deepest in app/)
 *  3. Route file middleware (exported `middleware` from page.tsx/route.ts)
 *  4. Downstream handler (Page component or API route handler)
 *
 * Returns a `MiddlewareResult` indicating whether the request was redirected,
 * short-circuited with a response, rewritten, or continued to the next handler.
 */
export async function runMiddleware(
  req: Request,
  cwd: string,
  isDev: boolean = false
): Promise<MiddlewareResult> {
  const pathname = req.path || (req.url ? req.url.split('?')[0] : '/');

  // 1. Discover Global Middleware
  const globalFile = discoverGlobalMiddleware(cwd, isDev);
  const entries: DiscoveredMiddlewareEntry[] = [];

  if (globalFile) {
    entries.push({
      source: 'global',
      filePath: globalFile,
      depth: 0,
    });
  }

  // 2. Discover Route-Specific Middlewares
  const routeFiles = discoverRouteMiddlewares(cwd, pathname, isDev);
  for (let i = 0; i < routeFiles.length; i++) {
    const file = routeFiles[i];
    const isMiddlewareFile = path.basename(file).startsWith('middleware.');
    entries.push({
      source: isMiddlewareFile ? 'segment' : 'route',
      filePath: file,
      depth: i + 1,
    });
  }

  // If no middleware discovered, skip directly
  if (entries.length === 0) {
    return { kind: 'skip' };
  }

  // 3. Filter entries that have valid middleware functions and match `config.matcher`
  interface ActiveMiddleware {
    filePath: string;
    source: string;
    fn: MiddlewareFunction;
  }

  const activeChain: ActiveMiddleware[] = [];

  for (const entry of entries) {
    const mod = loadModule(entry.filePath, isDev);
    if (!mod) continue;

    // In a route file (e.g. page.tsx, route.ts), we ONLY accept an explicit `export const middleware`
    // or `export function middleware` (not `export default`, which is the page component)
    let fn: MiddlewareFunction | undefined;
    if (entry.source === 'route') {
      if (typeof mod.middleware === 'function') {
        fn = mod.middleware;
      }
    } else {
      // In a dedicated middleware.* file, accept either `export default` or `export function middleware`
      if (typeof mod.middleware === 'function') {
        fn = mod.middleware;
      } else if (typeof mod.default === 'function') {
        fn = mod.default;
      }
    }

    if (!fn) continue;

    // Check optional matcher config
    if (!shouldRunMiddleware(mod, pathname)) {
      continue;
    }

    activeChain.push({
      filePath: entry.filePath,
      source: entry.source,
      fn,
    });
  }

  if (activeChain.length === 0) {
    return { kind: 'skip' };
  }

  // 4. Execute the chain
  let currentRequest = buildNextRequest(req);
  const aggregatedResponseHeaders = new Map<string, string>();
  const modifiedRequestHeaders = new Map<string, string>();

  async function dispatch(index: number, requestObj: VistaMiddlewareRequest): Promise<Response> {
    if (index >= activeChain.length) {
      // Terminal node: reached end of middleware chain
      return new Response(null, {
        status: 200,
        headers: {
          'x-middleware-next': '1',
        },
      });
    }

    const currentItem = activeChain[index];
    let nextCalled = false;
    let nextRequestObj = requestObj;

    const nextFn: NextFunction = async (options) => {
      nextCalled = true;
      if (options?.request?.headers) {
        nextRequestObj = cloneRequestWithHeaders(requestObj, options.request.headers);
        // Track modified request headers
        if (options.request.headers instanceof Headers) {
          options.request.headers.forEach((v, k) => modifiedRequestHeaders.set(k.toLowerCase(), v));
        } else {
          for (const [k, v] of Object.entries(options.request.headers)) {
            modifiedRequestHeaders.set(k.toLowerCase(), String(v));
          }
        }
      }
      return dispatch(index + 1, nextRequestObj);
    };

    const context: VistaMiddlewareContext = {
      request: requestObj,
      next: nextFn,
      url: requestObj.url,
      method: requestObj.method,
      headers: requestObj.headers,
      nextUrl: requestObj.nextUrl,
      cookies: requestObj.cookies,
    };

    try {
      // Invoke middleware. Supports:
      //  - middleware({ request, next }) [Issue #7 Part 5 signature]
      //  - middleware(request, next)
      //  - middleware(request)
      const output = await currentItem.fn(context, nextFn);

      // Handle direct Response return
      if (output instanceof Response) {
        return output;
      }

      // If next() was explicitly called and returned nothing, propagate standard continuation
      if (nextCalled) {
        return new Response(null, {
          status: 200,
          headers: {
            'x-middleware-next': '1',
          },
        });
      }

      // If middleware returned void without calling next(), continue to next in chain
      return dispatch(index + 1, requestObj);
    } catch (err) {
      console.error(
        `[vista:middleware] Error in middleware at ${currentItem.filePath}:`,
        (err as Error)?.message ?? String(err)
      );
      // On error, let request continue rather than completely hanging
      return dispatch(index + 1, requestObj);
    }
  }

  const finalResponse = await dispatch(0, currentRequest);

  // 5. Convert final Response to MiddlewareResult
  // Collect all response headers
  if (finalResponse.headers && typeof finalResponse.headers.forEach === 'function') {
    finalResponse.headers.forEach((val, key) => {
      aggregatedResponseHeaders.set(key, val);
    });
  }

  // 5a. Redirect
  const location = finalResponse.headers?.get?.('Location') || finalResponse.headers?.get?.('location');
  if (location) {
    return {
      kind: 'redirect',
      status: finalResponse.status || 307,
      location,
      responseHeaders: aggregatedResponseHeaders,
      requestHeaders: modifiedRequestHeaders,
    };
  }

  // 5b. Rewrite
  const rewrite = finalResponse.headers?.get?.('x-middleware-rewrite');
  if (rewrite) {
    return {
      kind: 'rewrite',
      location: rewrite,
      responseHeaders: aggregatedResponseHeaders,
      requestHeaders: modifiedRequestHeaders,
    };
  }

  // 5c. Continue to page/route handler
  const shouldContinue = finalResponse.headers?.get?.('x-middleware-next');
  if (shouldContinue) {
    return {
      kind: 'next',
      responseHeaders: aggregatedResponseHeaders,
      requestHeaders: modifiedRequestHeaders,
    };
  }

  // 5d. Short-circuit with response body and custom status
  let bodyContent: string | null = null;
  try {
    bodyContent = await finalResponse.text();
  } catch {}

  return {
    kind: 'short-circuit',
    status: finalResponse.status || 200,
    responseHeaders: aggregatedResponseHeaders,
    requestHeaders: modifiedRequestHeaders,
    body: bodyContent,
  };
}

// ---------------------------------------------------------------------------
// Apply Middleware Result
// ---------------------------------------------------------------------------

/**
 * Apply a MiddlewareResult to the Express request/response.
 * Returns `true` if the response was finalized (caller should `return`),
 * `false` if the request should continue to the next handler.
 */
export function applyMiddlewareResult(
  result: MiddlewareResult,
  req: Request,
  res: ExpressResponse
): boolean {
  // 1. Forward any modified request headers to req.headers
  if (result.requestHeaders && req.headers) {
    result.requestHeaders.forEach((value, key) => {
      req.headers[key.toLowerCase()] = value;
    });
  }

  // 2. Forward any response headers the middleware set
  if (result.responseHeaders) {
    result.responseHeaders.forEach((value, key) => {
      const lower = key.toLowerCase();
      // Skip internal transport headers
      if (lower === 'x-middleware-next' || lower === 'x-middleware-rewrite' || lower === 'location') {
        return;
      }
      res.setHeader(key, value);
    });
  }

  switch (result.kind) {
    case 'redirect':
      res.redirect(result.status || 307, result.location!);
      return true;

    case 'rewrite':
      req.url = result.location!;
      return false; // continue with rewritten URL

    case 'short-circuit': {
      const status = result.status || 403;
      if (result.body !== undefined && result.body !== null && result.body !== '') {
        res.status(status).send(result.body);
      } else {
        res.status(status).end();
      }
      return true;
    }

    case 'next':
    case 'skip':
    default:
      return false; // continue
  }
}
