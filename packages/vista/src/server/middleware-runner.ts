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
      if (name) {
        try {
          cookieMap.set(name, decodeURIComponent(val.join('=')));
        } catch {
          // Ignore malformed percent-encoded cookie values; do not abort middleware.
          cookieMap.set(name, val.join('='));
        }
      }
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
    // Include a body stream for methods that carry a body (POST, PUT, PATCH, DELETE).
    // Omitting body: null for GET/HEAD is required per the Fetch spec.
    const methodAllowsBody = !['GET', 'HEAD'].includes((req.method || '').toUpperCase());
    let bodyInit: ReadableStream<Uint8Array> | null = null;

    if (methodAllowsBody) {
      // Convert the Express Readable stream to a Web ReadableStream
      bodyInit = new ReadableStream<Uint8Array>({
        start(controller) {
          (req as any).on('data', (chunk: Buffer | string) => {
            controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          (req as any).once('end', () => controller.close());
          (req as any).once('error', (err: Error) => controller.error(err));
        },
      });
    }

    webRequest = new Request(fullUrl, {
      method: req.method,
      headers,
      body: bodyInit,
      // Required to pipe a stream body through the Web Fetch Request constructor
      ...(bodyInit ? { duplex: 'half' } : {}),
    } as any);
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
      // Reset lastIndex before and after to prevent stateful global/sticky regex bugs
      pattern.lastIndex = 0;
      const matched = pattern.test(pathname);
      pattern.lastIndex = 0;
      return matched;
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
      re.lastIndex = 0;
      const matched = re.test(pathname);
      re.lastIndex = 0;
      return matched;
    }
    if (pattern && typeof pattern === 'object' && typeof pattern.source === 'string') {
      try {
        const re = new RegExp(pattern.source, pattern.flags);
        re.lastIndex = 0;
        return re.test(pathname);
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
    // Refresh key recency for true LRU behaviour
    patternRegexCache.delete(pattern);
    patternRegexCache.set(pattern, cached);
    return cached;
  }

  let re = pattern
    .replace(/:[^/]+\*/g, '(.*)')
    .replace(/:[^/]+/g, '[^/]+')
    .replace(/\*/g, '(.*)');

  const compiled = new RegExp(`^${re}(/)?$`);
  if (patternRegexCache.size >= MAX_PATTERN_CACHE_SIZE) {
    // Evict oldest (LRU) entry
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

    // Tracks headers injected by next({ headers }) so they appear in MiddlewareResult.responseHeaders
    // for downstream inspection, without being sent as client response headers.
    const injectedRequestHeaders = new Map<string, string>();

    const nextFn = (options?: { headers?: HeadersInit }) => {
      if (options?.headers) {
        // Apply injected headers to the Express request so downstream route
        // handlers receive them. Do NOT attach them to the client response.
        new Headers(options.headers).forEach((value, key) => {
          req.headers[key.toLowerCase()] = value;
          // Also track so callers can inspect what was forwarded
          injectedRequestHeaders.set(key.toLowerCase(), value);
        });
      }
      return new Response(null, {
        status: 200,
        headers: { 'x-middleware-next': '1' },
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
      // Merge headers injected via next({ headers }) into responseHeaders so
      // callers can inspect what request-side headers middleware forwarded.
      injectedRequestHeaders.forEach((value, key) => responseHeaders.set(key, value));
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
