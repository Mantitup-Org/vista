/**
 * Vista Middleware Runner
 *
 * Shared middleware execution logic used by both the standard SSR engine
 * and the RSC engine. Discovers `middleware.ts` / `.tsx` / `.js` at the
 * project root, constructs a NextRequest-like object from the Express
 * request, invokes the user middleware, and returns a disposition that
 * the caller can act on.
 */
import type { Request as ExpressRequest } from 'express';
export interface MiddlewareResult {
    /** 'redirect' — send Location header and status */
    kind: 'redirect' | 'rewrite' | 'next' | 'short-circuit' | 'skip';
    /** HTTP status (e.g. 307 for redirect, 403 for short-circuit) */
    status?: number;
    /** Redirect target URL or rewrite path */
    location?: string;
    /** Extra response headers the middleware set (forwarded to client) */
    responseHeaders?: Map<string, string>;
    /** Headers injected via next({ headers }) — forwarded to the downstream request
     * but NOT sent as client response headers. Available for caller inspection. */
    injectedRequestHeaders?: Map<string, string>;
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
export interface MiddlewareContext {
    request: VistaMiddlewareRequest;
    next: (options?: {
        headers?: HeadersInit;
    }) => Response;
}
export declare function runMiddleware(req: ExpressRequest, cwd: string, isDev: boolean): Promise<MiddlewareResult>;
export declare function applyMiddlewareResult(result: MiddlewareResult, req: ExpressRequest, res: import('express').Response): boolean;
