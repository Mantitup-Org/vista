/**
 * Vista Middleware Runner
 *
 * Shared middleware execution logic used by both the standard SSR engine
 * and the RSC engine. Discovers `middleware.ts` / `.tsx` / `.js` at the
 * project root, constructs a NextRequest-like object from the Express
 * request, invokes the user middleware, and returns a disposition that
 * the caller can act on.
 */

import path from 'path';
import fs from 'fs';
import type { Request } from 'express';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiddlewareResult {
  /** 'redirect' — send Location header and status */
  kind: 'redirect' | 'rewrite' | 'next' | 'short-circuit' | 'skip';
  /** HTTP status (e.g. 307 for redirect, 403 for short-circuit) */
  status?: number;
  /** Redirect target URL or rewrite path */
  location?: string;
  /** Extra response headers the middleware set (forwarded to client) */
  responseHeaders?: Map<string, string>;
}

/** The NextRequest-like object we hand to middleware. */
export interface VistaMiddlewareRequest {
  url: string;
  method: string;
  headers: Map<string, string | string[] | undefined>;
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
}

// ---------------------------------------------------------------------------
// Middleware discovery cache (per-cwd)
// ---------------------------------------------------------------------------

export interface MiddlewareDef {
  filePath: string;
  prefix: string; // The URL prefix it auto-applies to
}

let allMiddlewaresCache = new Map<string, MiddlewareDef[]>();

function discoverAllMiddlewares(cwd: string, bustCache: boolean): MiddlewareDef[] {
  if (!bustCache && allMiddlewaresCache.has(cwd)) {
    return allMiddlewaresCache.get(cwd)!;
  }

  const results: MiddlewareDef[] = [];
  const candidates = ['middleware.ts', 'middleware.tsx', 'middleware.js'];

  // 1. Global middleware (root)
  for (const ext of candidates) {
    const p = path.join(cwd, ext);
    if (fs.existsSync(p)) {
      results.push({ filePath: p, prefix: '/' });
      break; // Only pick one at the root
    }
  }

  // 2. Nested middleware (app/)
  const appDir = path.join(cwd, 'app');
  if (fs.existsSync(appDir)) {
    const walk = (dir: string) => {
      for (const ext of candidates) {
        const p = path.join(dir, ext);
        if (fs.existsSync(p)) {
          const relative = path.relative(appDir, dir).replace(/\\/g, '/');
          const prefix = computeMiddlewarePrefix(relative);
          results.push({ filePath: p, prefix });
          break; // Only pick one per directory
        }
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name));
        }
      }
    };
    walk(appDir);
  }

  // Sort by prefix depth (shallowest first, so root runs first)
  results.sort((a, b) => {
    const depthA = a.prefix === '/' ? 0 : a.prefix.split('/').length;
    const depthB = b.prefix === '/' ? 0 : b.prefix.split('/').length;
    return depthA - depthB;
  });

  allMiddlewaresCache.set(cwd, results);
  return results;
}

function computeMiddlewarePrefix(relativeAppPath: string): string {
  if (!relativeAppPath) return '/';

  const segments = relativeAppPath.split('/');
  const processed = segments
    .filter((seg) => !(seg.startsWith('(') && seg.endsWith(')'))) // Remove route groups
    .map((seg) => {
      if (seg.startsWith('[...') && seg.endsWith(']')) {
        return '(.*)'; // Catch-all
      }
      if (seg.startsWith('[') && seg.endsWith(']')) {
        return `:${seg.slice(1, -1)}`; // Dynamic param
      }
      return seg;
    });

  if (processed.length === 0) return '/';
  return '/' + processed.join('/');
}

// ---------------------------------------------------------------------------
// Build NextRequest-like object
// ---------------------------------------------------------------------------

function buildNextRequest(req: Request): VistaMiddlewareRequest {
  const protocol = req.protocol;
  const host = req.get('host') || 'localhost';
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  return {
    url: fullUrl,
    method: req.method,
    headers: new Map(Object.entries(req.headers) as [string, any][]),
    nextUrl: {
      pathname: req.path,
      searchParams: new URLSearchParams(req.query as any),
      href: fullUrl,
      origin: `${protocol}://${host}`,
    },
    cookies: {
      get: (name: string) =>
        (req as any).cookies?.[name] ? { name, value: (req as any).cookies[name] } : undefined,
      getAll: () =>
        Object.entries((req as any).cookies || {}).map(([n, v]) => ({
          name: n,
          value: v,
        })),
      has: (name: string) => !!(req as any).cookies?.[name],
    },
  };
}

// ---------------------------------------------------------------------------
// Matcher support
// ---------------------------------------------------------------------------

/**
 * Evaluate the optional `config.matcher` exported alongside the middleware,
 * or fallback to the auto-generated directory prefix matcher.
 */
function shouldRunMiddleware(middlewareModule: any, pathname: string, prefix: string): boolean {
  const config = middlewareModule.config;
  
  if (config?.matcher) {
    const matchers: string[] = Array.isArray(config.matcher) ? config.matcher : [config.matcher];
    return matchers.some((pattern) => patternToRegExp(pattern).test(pathname));
  } else {
    const autoPattern = prefix === '/' ? '/(.*)' : `${prefix}(/.*)?`;
    return patternToRegExp(autoPattern).test(pathname);
  }
}

function patternToRegExp(pattern: string): RegExp {
  let re = pattern
    .replace(/:[a-zA-Z0-9_]+\*/g, '(.*)') // :path*
    .replace(/:[a-zA-Z0-9_]+/g, '[^/]+') // :param
    .replace(/\*/g, '(.*)'); // bare *

  return new RegExp(`^${re}(/)?$`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a chain of user-defined middlewares for the given request.
 */
export async function runMiddleware(
  req: Request,
  cwd: string,
  isDev: boolean
): Promise<MiddlewareResult> {
  const middlewares = discoverAllMiddlewares(cwd, isDev);
  if (middlewares.length === 0) {
    return { kind: 'skip' };
  }

  const accumulatedHeaders = new Map<string, string>();
  let nextRequest = buildNextRequest(req);

  for (const mwDef of middlewares) {
    try {
      if (isDev) {
        try {
          delete require.cache[require.resolve(mwDef.filePath)];
        } catch {
          continue;
        }
      }

      const middlewareModule = require(mwDef.filePath);
      const middleware = middlewareModule.default || middlewareModule.middleware;

      if (typeof middleware !== 'function') {
        continue;
      }

      if (!shouldRunMiddleware(middlewareModule, req.path, mwDef.prefix)) {
        continue;
      }

      // Inject accumulated headers into the request so downstream middleware sees them
      accumulatedHeaders.forEach((val, key) => {
        nextRequest.headers.set(key, val);
      });

      const response = await middleware(nextRequest);
      if (!response) {
        continue; // Implicit next()
      }

      // Collect new response headers
      if (response.headers && typeof response.headers.forEach === 'function') {
        response.headers.forEach((value: string, key: string) => {
          accumulatedHeaders.set(key, value);
        });
      }

      // 1. Redirect
      const location = response.headers?.get?.('Location');
      if (location) {
        return {
          kind: 'redirect',
          status: response.status || 307,
          location,
          responseHeaders: accumulatedHeaders,
        };
      }

      // 2. Rewrite
      const rewrite = response.headers?.get?.('x-middleware-rewrite');
      if (rewrite) {
        return {
          kind: 'rewrite',
          location: rewrite,
          responseHeaders: accumulatedHeaders,
        };
      }

      // 3. Short-circuit (non-200)
      if (response.status && response.status !== 200) {
        return {
          kind: 'short-circuit',
          status: response.status,
          responseHeaders: accumulatedHeaders,
        };
      }

      // 4. Continue (Next)
      // We loop to the next middleware.
    } catch (err) {
      console.error(`[vista] Middleware error in ${mwDef.filePath}: ${(err as Error)?.message ?? String(err)}`);
      // On error, let the request continue rather than crashing
    }
  }

  return { kind: 'next', responseHeaders: accumulatedHeaders };
}

/**
 * Apply a MiddlewareResult to the Express request/response.
 * Returns `true` if the response was finalized (caller should `return`),
 * `false` if the request should continue to the next handler.
 */
export function applyMiddlewareResult(
  result: MiddlewareResult,
  req: Request,
  res: import('express').Response
): boolean {
  // Forward any response headers the middleware set
  if (result.responseHeaders) {
    result.responseHeaders.forEach((value, key) => {
      // Skip internal headers
      if (key === 'x-middleware-next' || key === 'x-middleware-rewrite' || key === 'Location') {
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

    case 'short-circuit':
      res.status(result.status || 403).end();
      return true;

    case 'next':
    case 'skip':
    default:
      return false; // continue
  }
}
