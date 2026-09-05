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
import type { Request, Response as ExpressResponse } from 'express';
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
        get: (name: string) => {
            name: string;
            value: string;
        } | undefined;
        getAll: () => Array<{
            name: string;
            value: any;
        }>;
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
export type MiddlewareFunction = (contextOrRequest: VistaMiddlewareContext | VistaMiddlewareRequest, nextFn?: NextFunction) => Promise<Response | MiddlewareResult | void> | Response | MiddlewareResult | void;
export interface MiddlewareConfig {
    matcher?: string | string[];
}
export interface MiddlewareModule {
    default?: MiddlewareFunction;
    middleware?: MiddlewareFunction;
    config?: MiddlewareConfig;
    [key: string]: any;
}
export declare function clearMiddlewareCaches(): void;
/**
 * Discover top-level global middleware.
 * Checks `<cwd>/middleware.*` then `<cwd>/src/middleware.*`.
 */
export declare function discoverGlobalMiddleware(cwd: string, bustCache: boolean): string | null;
/**
 * Discover route-specific middleware files along the path hierarchy.
 * Returns file paths from shallowest segment to deepest segment.
 */
export declare function discoverRouteMiddlewares(cwd: string, pathname: string, bustCache: boolean): string[];
export declare function patternToRegExp(pattern: string): RegExp;
export declare function shouldRunMiddleware(middlewareModule: MiddlewareModule, pathname: string): boolean;
export declare function buildNextRequest(req: Request): VistaMiddlewareRequest;
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
export declare function runMiddleware(req: Request, cwd: string, isDev?: boolean): Promise<MiddlewareResult>;
/**
 * Apply a MiddlewareResult to the Express request/response.
 * Returns `true` if the response was finalized (caller should `return`),
 * `false` if the request should continue to the next handler.
 */
export declare function applyMiddlewareResult(result: MiddlewareResult, req: Request, res: ExpressResponse): boolean;
