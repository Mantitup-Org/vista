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

export interface VistaMiddlewareContext extends VistaMiddlewareRequest {
  request: VistaMiddlewareRequest;
  next: () => Promise<MiddlewareNextResult>;
}

interface MiddlewareNextResult {
  headers: Map<string, string>;
}

const middlewareNextHeader = 'x-middleware-next';

// ---------------------------------------------------------------------------
// Middleware discovery cache (per-cwd)
// ---------------------------------------------------------------------------

const discoveryCache = new Map<string, string | null>();

function discoverMiddleware(cwd: string, bustCache: boolean): string | null {
  if (!bustCache && discoveryCache.has(cwd)) {
    return discoveryCache.get(cwd)!;
  }

  const candidates = [
    path.resolve(cwd, 'middleware.ts'),
    path.resolve(cwd, 'middleware.tsx'),
    path.resolve(cwd, 'middleware.js'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      discoveryCache.set(cwd, p);
      return p;
    }
  }

  discoveryCache.set(cwd, null);
  return null;
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

function buildMiddlewareContext(request: VistaMiddlewareRequest): VistaMiddlewareContext {
  return {
    ...request,
    request,
    next: async () => ({
      headers: new Map([[middlewareNextHeader, '1']]),
    }),
  };
}

// ---------------------------------------------------------------------------
// Matcher support
// ---------------------------------------------------------------------------

/**
 * Evaluate the optional `config.matcher` exported alongside the middleware.
 * Returns `true` if the request matches (or if no matcher is defined).
 */
function shouldRunMiddleware(middlewareModule: any, pathname: string): boolean {
  const config = middlewareModule.config;
  if (!config?.matcher) return true;

  const matchers: string[] = Array.isArray(config.matcher) ? config.matcher : [config.matcher];

  return matchers.some((pattern) => {
    // Simple path-prefix matching with basic wildcard support
    // e.g. '/dashboard/:path*' → matches /dashboard, /dashboard/settings …
    const re = patternToRegExp(pattern);
    return re.test(pathname);
  });
}

function patternToRegExp(pattern: string): RegExp {
  // Convert Next.js-style matcher patterns to RegExp:
  //   /foo/:path*  → /foo(/.*)?
  //   /foo/:bar    → /foo/[^/]+
  //   /foo/*       → /foo(/.*)?
  const re = pattern
    .replace(/:[^/]+\*/g, '(.*)') // :path*
    .replace(/:[^/]+/g, '[^/]+') // :param
    .replace(/\*/g, '(.*)'); // bare *

  return new RegExp(`^${re}(/)?$`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run user-defined middleware for the given request.
 *
 * @param req   Express request
 * @param cwd   Project root (where middleware.ts lives)
 * @param isDev Whether we're in dev mode (busts require cache)
 */
export async function runMiddleware(
  req: Request,
  cwd: string,
  isDev: boolean
): Promise<MiddlewareResult> {
  const middlewareFile = discoverMiddleware(cwd, isDev);
  if (!middlewareFile) {
    return { kind: 'skip' };
  }

  try {
    // Hot-reload: bust require cache in dev
    if (isDev) {
      try {
        delete require.cache[require.resolve(middlewareFile)];
      } catch {
        // resolve may throw if file was just deleted — treat as skip
        discoveryCache.delete(cwd);
        return { kind: 'skip' };
      }
    }

    const middlewareModule = require(middlewareFile);
    const middleware = middlewareModule.default || middlewareModule.middleware;

    if (typeof middleware !== 'function') {
      return { kind: 'skip' };
    }

    // Matcher check
    if (!shouldRunMiddleware(middlewareModule, req.path)) {
      return { kind: 'skip' };
    }

    const nextRequest = buildNextRequest(req);
    const response = await middleware(buildMiddlewareContext(nextRequest));

    if (!response) {
      return { kind: 'next' };
    }

    // Collect response headers the middleware may have set
    const responseHeaders = new Map<string, string>();
    if (response.headers && typeof response.headers.forEach === 'function') {
      response.headers.forEach((value: string, key: string) => {
        responseHeaders.set(key, value);
      });
    }

    // 1. Redirect
    const location = response.headers?.get?.('Location');
    if (location) {
      return {
        kind: 'redirect',
        status: response.status || 307,
        location,
        responseHeaders,
      };
    }

    // 2. Rewrite
    const rewrite = response.headers?.get?.('x-middleware-rewrite');
    if (rewrite) {
      return {
        kind: 'rewrite',
        location: rewrite,
        responseHeaders,
      };
    }

    // 3. Continue
    const shouldContinue = response.headers?.get?.(middlewareNextHeader);
    if (shouldContinue) {
      return { kind: 'next', responseHeaders };
    }

    // 4. Short-circuit (non-200 status with no continue/redirect/rewrite)
    if (response.status && response.status !== 200) {
      return {
        kind: 'short-circuit',
        status: response.status,
        responseHeaders,
      };
    }

    // Default — continue
    return { kind: 'next', responseHeaders };
  } catch (err) {
    console.error(`[vista] Middleware error: ${(err as Error)?.message ?? String(err)}`);
    // On error, let the request continue rather than crashing
    return { kind: 'next' };
  }
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
