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
export interface VistaMiddlewareContext {
    request: VistaMiddlewareRequest & RequestLike;
    next: () => Promise<Response>;
}
type RequestLike = VistaMiddlewareRequest & {
    request?: VistaMiddlewareRequest;
    next?: () => Promise<Response>;
};
export declare function runMiddleware(req: Request, cwd: string, isDev: boolean): Promise<MiddlewareResult>;
export declare function applyMiddlewareResult(result: MiddlewareResult, req: Request, res: import('express').Response): boolean;
export declare function listMiddlewareFiles(cwd: string, pathname: string): string[];
export {};
