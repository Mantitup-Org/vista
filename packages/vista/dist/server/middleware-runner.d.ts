/**
 * Vista Middleware Runner
 *
 * Shared middleware execution logic used by both the standard SSR engine
 * and the RSC engine. Discovers `middleware.ts` / `.tsx` / `.js` at the
 * project root, constructs a NextRequest-like object from the Express
 * request, invokes the user middleware, and returns a disposition that
 * the caller can act on.
 */
import type { Request } from 'express';
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
}
export interface MiddlewareDef {
    filePath: string;
    prefix: string;
}
/**
 * Run a chain of user-defined middlewares for the given request.
 */
export declare function runMiddleware(req: Request, cwd: string, isDev: boolean): Promise<MiddlewareResult>;
/**
 * Apply a MiddlewareResult to the Express request/response.
 * Returns `true` if the response was finalized (caller should `return`),
 * `false` if the request should continue to the next handler.
 */
export declare function applyMiddlewareResult(result: MiddlewareResult, req: Request, res: import('express').Response): boolean;
