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
import type { Request as ExpressRequest } from 'express';

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
  /** Optional response body when short-circuiting */
  body?: Buffer | string;
}

/** The NextRequest-like object we hand to middleware. */
export interface VistaMiddlewareRequest extends Request {
  url: string;
  method: string;
  headers: any;
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

export interface MiddlewareContext {
  request: VistaMiddlewareRequest;
  next: (options?: { headers?: HeadersInit }) => Response;
}

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
    path.resolve(cwd, 'src', 'middleware.ts'),
    path.resolve(cwd, 'src', 'middleware.tsx'),
    path.resolve(cwd, 'src', 'middleware.js'),
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
// Build NextRequest-like and Web API Request object
// ---------------------------------------------------------------------------

function buildMiddlewareRequest(req: ExpressRequest): any {
  const protocol = req.protocol || 'http';
  const host = (typeof req.get === 'function' ? req.get('host') : (req.headers as any)?.host) || 'localhost';
  const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;
  const requestUrl = new URL(fullUrl);

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else if (v !== undefined) {
      headers.set(k, String(v));
    }
  }

  const cookieMap = new Map<string, string>();
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const cookie of cookieHeader.split(';')) {
      const [name, ...val] = cookie.trim().split('=');
      if (name) cookieMap.set(name, decodeURIComponent(val.join('=')));
    }
  }

  const cookies = {
    get: (name: string) =>
      cookieMap.has(name) ? { name, value: cookieMap.get(name)! } : undefined,
    getAll: () => Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value })),
    has: (name: string) => cookieMap.has(name),
  };

  const nextUrl = {
    pathname: req.path || requestUrl.pathname,
    searchParams: requestUrl.searchParams,
    href: fullUrl,
    origin: requestUrl.origin,
  };

  let webRequest: any;
  try {
    webRequest = new Request(fullUrl, {
      method: req.method,
      headers,
    });
  } catch {
    webRequest = {
      url: fullUrl,
      method: req.method,
      headers,
    };
  }

  webRequest.nextUrl = nextUrl;
  webRequest.cookies = cookies;

  return webRequest;
}

// ---------------------------------------------------------------------------
// Matcher support (supports string patterns, RegExp, and array)
// ---------------------------------------------------------------------------

function shouldRunMiddleware(middlewareModule: any, pathname: string): boolean {
  const config = middlewareModule.config;
  if (!config?.matcher) return true;

  const matchers = Array.isArray(config.matcher) ? config.matcher : [config.matcher];

  return matchers.some((pattern: any) => {
    if (pattern instanceof RegExp) {
      return pattern.test(pathname);
    }
    if (typeof pattern === 'string') {
      if (pattern.startsWith('^') || pattern.endsWith('$')) {
        try {
          return new RegExp(pattern).test(pathname);
        } catch {
          // fall through
        }
      }
      const re = patternToRegExp(pattern);
      return re.test(pathname);
    }
    if (pattern && typeof pattern === 'object' && typeof pattern.source === 'string') {
      try {
        return new RegExp(pattern.source, pattern.flags).test(pathname);
      } catch {
        return false;
      }
    }
    return true;
  });
}

const patternRegexCache = new Map<string, RegExp>();
const MAX_PATTERN_CACHE_SIZE = 512;

function patternToRegExp(pattern: string): RegExp {
  const cached = patternRegexCache.get(pattern);
  if (cached) {
    return cached;
  }

  let re = pattern
    .replace(/:[^/]+\*/g, '(.*)')
    .replace(/:[^/]+/g, '[^/]+')
    .replace(/\*/g, '(.*)');

  const compiled = new RegExp(`^${re}(/)?$`);
  if (patternRegexCache.size >= MAX_PATTERN_CACHE_SIZE) {
    const firstKey = patternRegexCache.keys().next().value;
    if (firstKey !== undefined) {
      patternRegexCache.delete(firstKey);
    }
  }
  patternRegexCache.set(pattern, compiled);
  return compiled;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runMiddleware(
  req: ExpressRequest,
  cwd: string,
  isDev: boolean
): Promise<MiddlewareResult> {
  const middlewareFile = discoverMiddleware(cwd, isDev);
  if (!middlewareFile) {
    return { kind: 'skip' };
  }

  try {
    if (isDev) {
      try {
        delete require.cache[require.resolve(middlewareFile)];
      } catch {
        discoveryCache.delete(cwd);
        return { kind: 'skip' };
      }
    }

    const middlewareModule = require(middlewareFile);
    const middleware = middlewareModule.middleware || middlewareModule.default;

    if (typeof middleware !== 'function') {
      return { kind: 'skip' };
    }

    if (!shouldRunMiddleware(middlewareModule, req.path)) {
      return { kind: 'skip' };
    }

    const requestObj = buildMiddlewareRequest(req);

    const nextFn = (options?: { headers?: HeadersInit }) => {
      const resHeaders = new Headers();
      resHeaders.set('x-middleware-next', '1');
      if (options?.headers) {
        new Headers(options.headers).forEach((v, k) => resHeaders.set(k, v));
      }
      return new Response(null, {
        status: 200,
        headers: resHeaders,
      });
    };

    // Attach request and next to requestObj so both destructuring ({ request, next })
    // and direct parameter (request) access work seamlessly
    requestObj.request = requestObj;
    requestObj.next = nextFn;

    const response = await middleware(requestObj, { request: requestObj, next: nextFn });

    if (!response) {
      return { kind: 'next' };
    }

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

    // 3. Continue via next()
    const shouldContinue = response.headers?.get?.('x-middleware-next');
    if (shouldContinue) {
      return { kind: 'next', responseHeaders };
    }

    // 4. Short-circuit with response body
    if (!shouldContinue) {
      let body: Buffer | undefined;
      try {
        const ab = await response.arrayBuffer();
        if (ab.byteLength > 0) {
          body = Buffer.from(ab);
        }
      } catch {
        // ignore body read error
      }

      return {
        kind: 'short-circuit',
        status: response.status || 200,
        responseHeaders,
        body,
      };
    }

    return { kind: 'next', responseHeaders };
  } catch (err) {
    console.error(`[vista] Middleware error: ${(err as Error)?.message ?? String(err)}`);
    return { kind: 'next' };
  }
}

export function applyMiddlewareResult(
  result: MiddlewareResult,
  req: ExpressRequest,
  res: import('express').Response
): boolean {
  if (result.responseHeaders) {
    result.responseHeaders.forEach((value, key) => {
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
      return false;

    case 'short-circuit':
      if (result.body) {
        res.status(result.status || 403).send(result.body);
      } else {
        res.status(result.status || 403).end();
      }
      return true;

    case 'next':
    case 'skip':
    default:
      return false;
  }
}
