/**
 * Vista Server Utilities
 *
 * Next.js-compatible server-only functions for use in Server Components and API routes.
 * These functions only work on the server side.
 */
export interface CookieOptions {
    maxAge?: number;
    expires?: Date;
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    priority?: 'low' | 'medium' | 'high';
}
export interface ReadonlyCookie {
    name: string;
    value: string;
}
export interface CookieStore {
    get(name: string): ReadonlyCookie | undefined;
    getAll(): ReadonlyCookie[];
    has(name: string): boolean;
    set(name: string, value: string, options?: CookieOptions): void;
    delete(name: string): void;
}
/**
 * Access cookies in Server Components and API routes.
 * Note: This is a simplified implementation - in production, integrate with actual request.
 */
export declare function cookies(): CookieStore;
export interface ReadonlyHeaders {
    get(name: string): string | null;
    has(name: string): boolean;
    entries(): IterableIterator<[string, string]>;
    keys(): IterableIterator<string>;
    values(): IterableIterator<string>;
    forEach(callback: (value: string, key: string) => void): void;
}
/**
 * Access request headers in Server Components.
 * Note: This is a simplified implementation - in production, integrate with actual request.
 */
export declare function headers(): ReadonlyHeaders;
export interface DraftMode {
    isEnabled: boolean;
    enable(): void;
    disable(): void;
}
export declare function draftMode(): DraftMode;
export type RedirectType = 'push' | 'replace';
export declare class RedirectError extends Error {
    readonly url: string;
    readonly type: RedirectType;
    constructor(url: string, type?: RedirectType);
}
/**
 * Redirect to another URL from a Server Component or API route.
 * @param url - The URL to redirect to
 * @param type - The type of redirect ('push' or 'replace')
 * @throws RedirectError - Always throws to interrupt rendering
 */
export declare function redirect(url: string, type?: RedirectType): never;
/**
 * Permanent redirect (HTTP 308) to another URL.
 * @param url - The URL to redirect to
 * @throws RedirectError - Always throws to interrupt rendering
 */
export declare function permanentRedirect(url: string): never;
export declare class NotFoundError extends Error {
    constructor();
}
/**
 * Trigger a 404 Not Found response from a Server Component.
 * @throws NotFoundError - Always throws to interrupt rendering
 */
export declare function notFound(): never;
/**
 * Create a JSON response (for API routes).
 */
export declare function json<T>(data: T, init?: ResponseInit): Response;
/**
 * Create a NextResponse-compatible response object.
 */
export declare class NextResponse extends Response {
    static json<T>(data: T, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, status?: number): NextResponse;
    static rewrite(url: string | URL): NextResponse;
    static next(options?: {
        request?: {
            headers?: Headers | Record<string, string>;
        };
    }): NextResponse;
}
export interface NextRequest extends Request {
    nextUrl: {
        pathname: string;
        searchParams: URLSearchParams;
        href: string;
        origin: string;
    };
    cookies: CookieStore;
    headers: Headers;
}
export { cacheLife, cacheTag, revalidatePath, revalidateTag, unstable_cache } from './cache';
export { runMiddleware, applyMiddlewareResult, discoverGlobalMiddleware, discoverRouteMiddlewares, clearMiddlewareCaches, buildNextRequest, patternToRegExp, shouldRunMiddleware, } from './middleware-runner';
export type { MiddlewareResult, VistaMiddlewareRequest, VistaMiddlewareContext, MiddlewareFunction, MiddlewareConfig, MiddlewareModule, NextFunction, } from './middleware-runner';
