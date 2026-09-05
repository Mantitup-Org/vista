/**
 * Vista Middleware Runner
 *
 * Discovers and runs middleware for pages and API routes.
 *
 * Execution order (parent to child):
 *   1. Project-root middleware.ts / middleware.js
 *   2. app/middleware.ts
 *   3. Nested segment middleware files along the request path
 *
 * Supported signatures:
 *   export async function middleware(request) { return next() }
 *   export async function middleware({ request, next }) { return next() }
 */

import path from 'path';
import fs from 'fs';
import type { Request } from 'express';

export interface MiddlewareResult {
  kind: 'redirect' | 'rewrite' | 'next' | 'short-circuit' | 'skip';
  status?: number;
  location?: string;
  body?: string;
  responseHeaders?: Map<string, string>;
}

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

export interface VistaMiddlewareContext {
  request: VistaMiddlewareRequest & RequestLike;
  next: () => Promise<Response>;
}

type RequestLike = VistaMiddlewareRequest & {
  request?: VistaMiddlewareRequest;
  next?: () => Promise<Response>;
};

const MIDDLEWARE_FILENAMES = ['middleware.ts', 'middleware.tsx', 'middleware.js', 'middleware.jsx'];
const discoveryCache = new Map<string, string[]>();

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

function patternToRegExp(pattern: string): RegExp {
  let re = pattern
    .replace(/:[^/]+\*/g, '(.*)')
    .replace(/:[^/]+/g, '[^/]+')
    .replace(/\*/g, '(.*)');

  return new RegExp(`^${re}(/)?$`);
}

function shouldRunMiddleware(middlewareModule: any, pathname: string): boolean {
  const config = middlewareModule.config;
  if (!config?.matcher) return true;

  const matchers: string[] = Array.isArray(config.matcher) ? config.matcher : [config.matcher];
  return matchers.some((pattern) => patternToRegExp(pattern).test(pathname));
}

function firstExistingFile(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function collectMiddlewareFiles(cwd: string, pathname: string, bustCache: boolean): string[] {
  const cacheKey = `${cwd}::${pathname}`;
  if (!bustCache && discoveryCache.has(cacheKey)) {
    return discoveryCache.get(cacheKey)!;
  }

  const files: string[] = [];
  const seen = new Set<string>();
  const add = (filePath: string | null) => {
    if (!filePath || seen.has(filePath)) return;
    seen.add(filePath);
    files.push(filePath);
  };

  add(firstExistingFile(MIDDLEWARE_FILENAMES.map((name) => path.resolve(cwd, name))));
  add(firstExistingFile(MIDDLEWARE_FILENAMES.map((name) => path.resolve(cwd, 'src', name))));

  const segments = String(pathname || '/')
    .split('/')
    .filter(Boolean);

  const appRoots = [path.resolve(cwd, 'app'), path.resolve(cwd, 'src', 'app')].filter((dir) =>
    fs.existsSync(dir)
  );

  for (const appRoot of appRoots) {
    add(firstExistingFile(MIDDLEWARE_FILENAMES.map((name) => path.join(appRoot, name))));

    let current = appRoot;
    for (const segment of segments) {
      current = path.join(current, segment);
      add(firstExistingFile(MIDDLEWARE_FILENAMES.map((name) => path.join(current, name))));
    }
  }

  discoveryCache.set(cacheKey, files);
  return files;
}

function interpretMiddlewareResponse(response: any, nextCalled: boolean): MiddlewareResult {
  if (!response) {
    return nextCalled ? { kind: 'next' } : { kind: 'next' };
  }

  const responseHeaders = new Map<string, string>();
  if (response.headers && typeof response.headers.forEach === 'function') {
    response.headers.forEach((value: string, key: string) => {
      responseHeaders.set(key, value);
    });
  }

  const location = response.headers?.get?.('Location') || response.headers?.get?.('location');
  if (location) {
    return {
      kind: 'redirect',
      status: response.status || 307,
      location,
      responseHeaders,
    };
  }

  const rewrite = response.headers?.get?.('x-middleware-rewrite');
  if (rewrite) {
    return {
      kind: 'rewrite',
      location: rewrite,
      responseHeaders,
    };
  }

  const shouldContinue = response.headers?.get?.('x-middleware-next');
  if (shouldContinue || nextCalled) {
    return { kind: 'next', responseHeaders };
  }

  if (response.status && response.status !== 200) {
    return {
      kind: 'short-circuit',
      status: response.status,
      responseHeaders,
      body: typeof response.bodyUsed === 'boolean' && !response.bodyUsed ? undefined : undefined,
    };
  }

  return { kind: 'next', responseHeaders };
}

async function invokeMiddlewareModule(
  middlewareFile: string,
  req: Request,
  isDev: boolean
): Promise<MiddlewareResult> {
  try {
    if (isDev) {
      try {
        delete require.cache[require.resolve(middlewareFile)];
      } catch {
        return { kind: 'skip' };
      }
    }

    const middlewareModule = require(middlewareFile);
    const middleware = middlewareModule.default || middlewareModule.middleware;
    if (typeof middleware !== 'function') {
      return { kind: 'skip' };
    }

    if (!shouldRunMiddleware(middlewareModule, req.path)) {
      return { kind: 'skip' };
    }

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
      const response = new Response(null, { status: 200 });
      response.headers.set('x-middleware-next', '1');
      return response;
    };

    const vistaRequest = buildNextRequest(req);
    const hybrid: RequestLike = Object.assign(vistaRequest, {
      request: vistaRequest,
      next,
    });

    let response: any;
    try {
      response = await middleware(hybrid, next);
    } catch {
      response = await middleware({ request: vistaRequest, next });
    }

    if (response instanceof Promise) {
      response = await response;
    }

    return interpretMiddlewareResponse(response, nextCalled);
  } catch (err) {
    console.error(`[vista] Middleware error in ${path.basename(middlewareFile)}: ${(err as Error)?.message ?? String(err)}`);
    return { kind: 'next' };
  }
}

export async function runMiddleware(
  req: Request,
  cwd: string,
  isDev: boolean
): Promise<MiddlewareResult> {
  const files = collectMiddlewareFiles(cwd, req.path, isDev);
  if (files.length === 0) {
    return { kind: 'skip' };
  }

  const mergedHeaders = new Map<string, string>();
  for (const file of files) {
    const result = await invokeMiddlewareModule(file, req, isDev);
    if (result.responseHeaders) {
      result.responseHeaders.forEach((value, key) => mergedHeaders.set(key, value));
    }

    if (result.kind === 'skip' || result.kind === 'next') {
      continue;
    }

    return {
      ...result,
      responseHeaders: mergedHeaders,
    };
  }

  return {
    kind: 'next',
    responseHeaders: mergedHeaders.size > 0 ? mergedHeaders : undefined,
  };
}

export function applyMiddlewareResult(
  result: MiddlewareResult,
  req: Request,
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
      res.status(result.status || 403);
      if (result.body) {
        res.send(result.body);
      } else {
        res.end();
      }
      return true;

    case 'next':
    case 'skip':
    default:
      return false;
  }
}

export function listMiddlewareFiles(cwd: string, pathname: string): string[] {
  return collectMiddlewareFiles(cwd, pathname, true);
}
