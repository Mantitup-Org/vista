/**
 * Middleware security primitives.
 *
 * These are Next-inspired helpers that apps can compose in `middleware.ts`.
 * The runner also uses the redirect/header sanitizers internally.
 */
export declare const FORBIDDEN_REQUEST_HEADERS: Set<string>;
export declare function isForbiddenRequestHeader(name: string): boolean;
export declare function sanitizeRequestHeaderMap(headers: Map<string, string> | Headers | Record<string, string>): Map<string, string>;
export declare function isSafeRedirectLocation(location: string, requestUrl: string, allowedHosts?: string[]): boolean;
export declare function isSafeRewriteLocation(location: string): boolean;
export declare function securityHeaders(init?: ResponseInit): Headers;
export declare function cors(options?: {
    origin?: string | string[] | '*';
    methods?: string[];
    headers?: string[];
    credentials?: boolean;
    maxAge?: number;
}): (request: Request) => Headers;
export declare function rateLimit(options?: {
    key?: string;
    limit?: number;
    windowMs?: number;
    identifier?: (request: {
        headers: Headers;
        ip?: string;
    }) => string;
}): (request: {
    headers: Headers;
    ip?: string;
}) => {
    ok: boolean;
    remaining: number;
};
export type MiddlewareLike = (context: any) => Promise<Response | void> | Response | void;
export declare function chain(middlewares: MiddlewareLike[]): MiddlewareLike;
