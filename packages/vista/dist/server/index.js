"use strict";
/**
 * Vista Server Utilities
 *
 * Next.js-compatible server-only functions for use in Server Components and API routes.
 * These functions only work on the server side.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldRunMiddleware = exports.patternToRegExp = exports.buildNextRequest = exports.clearMiddlewareCaches = exports.discoverRouteMiddlewares = exports.discoverGlobalMiddleware = exports.applyMiddlewareResult = exports.runMiddleware = exports.unstable_cache = exports.revalidateTag = exports.revalidatePath = exports.cacheTag = exports.cacheLife = exports.NextResponse = exports.NotFoundError = exports.RedirectError = void 0;
exports.cookies = cookies;
exports.headers = headers;
exports.draftMode = draftMode;
exports.redirect = redirect;
exports.permanentRedirect = permanentRedirect;
exports.notFound = notFound;
exports.json = json;
const request_context_1 = require("./request-context");
function parseCookieHeader(header) {
    const cookieMap = new Map();
    if (!header) {
        return cookieMap;
    }
    for (const segment of header.split(';')) {
        const [rawName, ...valueParts] = segment.split('=');
        const name = rawName?.trim();
        if (!name)
            continue;
        cookieMap.set(name, decodeURIComponent(valueParts.join('=').trim()));
    }
    return cookieMap;
}
function serializeCookie(name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (options.maxAge !== undefined)
        parts.push(`Max-Age=${options.maxAge}`);
    if (options.expires)
        parts.push(`Expires=${options.expires.toUTCString()}`);
    if (options.domain)
        parts.push(`Domain=${options.domain}`);
    parts.push(`Path=${options.path || '/'}`);
    if (options.secure)
        parts.push('Secure');
    if (options.httpOnly)
        parts.push('HttpOnly');
    if (options.sameSite)
        parts.push(`SameSite=${options.sameSite}`);
    if (options.priority)
        parts.push(`Priority=${options.priority}`);
    return parts.join('; ');
}
function appendSetCookie(serializedCookie) {
    const res = (0, request_context_1.getRequestContext)()?.res;
    if (!res) {
        return;
    }
    const current = res.getHeader('Set-Cookie');
    if (!current) {
        res.setHeader('Set-Cookie', [serializedCookie]);
        return;
    }
    if (Array.isArray(current)) {
        res.setHeader('Set-Cookie', [...current.map((entry) => String(entry)), serializedCookie]);
        return;
    }
    res.setHeader('Set-Cookie', [String(current), serializedCookie]);
}
function createCookieStore() {
    const request = (0, request_context_1.getRequestContext)()?.req;
    const cookieMap = parseCookieHeader(request?.headers?.cookie);
    const syncRequestCookieHeader = () => {
        if (!request || !request.headers) {
            return;
        }
        request.headers.cookie = Array.from(cookieMap.entries())
            .map(([name, cookieValue]) => `${name}=${encodeURIComponent(cookieValue)}`)
            .join('; ');
    };
    return {
        get(name) {
            const value = cookieMap.get(name);
            return value === undefined ? undefined : { name, value };
        },
        getAll() {
            return Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }));
        },
        has(name) {
            return cookieMap.has(name);
        },
        set(name, value, options) {
            cookieMap.set(name, value);
            syncRequestCookieHeader();
            appendSetCookie(serializeCookie(name, value, options));
        },
        delete(name) {
            cookieMap.delete(name);
            syncRequestCookieHeader();
            appendSetCookie(serializeCookie(name, '', {
                expires: new Date(0),
                maxAge: 0,
                path: '/',
            }));
        },
    };
}
function createReadonlyHeaders() {
    const request = (0, request_context_1.getRequestContext)()?.req;
    const headerMap = new Map();
    if (request?.headers) {
        for (const [key, value] of Object.entries(request.headers)) {
            if (Array.isArray(value)) {
                headerMap.set(key.toLowerCase(), value.join(', '));
                continue;
            }
            if (value !== undefined) {
                headerMap.set(key.toLowerCase(), String(value));
            }
        }
    }
    return {
        get(name) {
            return headerMap.get(name.toLowerCase()) ?? null;
        },
        has(name) {
            return headerMap.has(name.toLowerCase());
        },
        entries() {
            return headerMap.entries();
        },
        keys() {
            return headerMap.keys();
        },
        values() {
            return headerMap.values();
        },
        forEach(callback) {
            headerMap.forEach((value, key) => callback(value, key));
        },
    };
}
/**
 * Access cookies in Server Components and API routes.
 * Note: This is a simplified implementation - in production, integrate with actual request.
 */
function cookies() {
    // Check if we're in a server context
    if (typeof window !== 'undefined') {
        console.warn('cookies() should only be called on the server');
    }
    return createCookieStore();
}
/**
 * Access request headers in Server Components.
 * Note: This is a simplified implementation - in production, integrate with actual request.
 */
function headers() {
    if (typeof window !== 'undefined') {
        console.warn('headers() should only be called on the server');
    }
    return createReadonlyHeaders();
}
// ============================================================================
// Draft Mode
// ============================================================================
const DRAFT_MODE_COOKIE = '__vista_draft_mode';
function draftMode() {
    const store = cookies();
    return {
        get isEnabled() {
            return store.has(DRAFT_MODE_COOKIE);
        },
        enable() {
            store.set(DRAFT_MODE_COOKIE, '1', {
                httpOnly: true,
                path: '/',
                sameSite: 'lax',
            });
        },
        disable() {
            store.delete(DRAFT_MODE_COOKIE);
        },
    };
}
class RedirectError extends Error {
    url;
    type;
    constructor(url, type = 'replace') {
        super(`Redirect to ${url}`);
        this.name = 'RedirectError';
        this.url = url;
        this.type = type;
    }
}
exports.RedirectError = RedirectError;
/**
 * Redirect to another URL from a Server Component or API route.
 * @param url - The URL to redirect to
 * @param type - The type of redirect ('push' or 'replace')
 * @throws RedirectError - Always throws to interrupt rendering
 */
function redirect(url, type = 'replace') {
    throw new RedirectError(url, type);
}
/**
 * Permanent redirect (HTTP 308) to another URL.
 * @param url - The URL to redirect to
 * @throws RedirectError - Always throws to interrupt rendering
 */
function permanentRedirect(url) {
    throw new RedirectError(url, 'replace');
}
// ============================================================================
// Not Found
// ============================================================================
class NotFoundError extends Error {
    constructor() {
        super('Not Found');
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
/**
 * Trigger a 404 Not Found response from a Server Component.
 * @throws NotFoundError - Always throws to interrupt rendering
 */
function notFound() {
    throw new NotFoundError();
}
// ============================================================================
// Response Helpers
// ============================================================================
/**
 * Create a JSON response (for API routes).
 */
function json(data, init) {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...init?.headers,
        },
    });
}
/**
 * Create a NextResponse-compatible response object.
 */
class NextResponse extends Response {
    static json(data, init) {
        return new NextResponse(JSON.stringify(data), {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                ...init?.headers,
            },
        });
    }
    static redirect(url, status = 307) {
        return new NextResponse(null, {
            status,
            headers: {
                Location: url.toString(),
            },
        });
    }
    static rewrite(url) {
        // Rewrite implementation would go here
        return new NextResponse(null, {
            headers: {
                'x-middleware-rewrite': url.toString(),
            },
        });
    }
    static next(options) {
        const responseHeaders = new Headers();
        responseHeaders.set('x-middleware-next', '1');
        return new NextResponse(null, {
            headers: responseHeaders,
        });
    }
}
exports.NextResponse = NextResponse;
var cache_1 = require("./cache");
Object.defineProperty(exports, "cacheLife", { enumerable: true, get: function () { return cache_1.cacheLife; } });
Object.defineProperty(exports, "cacheTag", { enumerable: true, get: function () { return cache_1.cacheTag; } });
Object.defineProperty(exports, "revalidatePath", { enumerable: true, get: function () { return cache_1.revalidatePath; } });
Object.defineProperty(exports, "revalidateTag", { enumerable: true, get: function () { return cache_1.revalidateTag; } });
Object.defineProperty(exports, "unstable_cache", { enumerable: true, get: function () { return cache_1.unstable_cache; } });
// ============================================================================
// Middleware System
// ============================================================================
var middleware_runner_1 = require("./middleware-runner");
Object.defineProperty(exports, "runMiddleware", { enumerable: true, get: function () { return middleware_runner_1.runMiddleware; } });
Object.defineProperty(exports, "applyMiddlewareResult", { enumerable: true, get: function () { return middleware_runner_1.applyMiddlewareResult; } });
Object.defineProperty(exports, "discoverGlobalMiddleware", { enumerable: true, get: function () { return middleware_runner_1.discoverGlobalMiddleware; } });
Object.defineProperty(exports, "discoverRouteMiddlewares", { enumerable: true, get: function () { return middleware_runner_1.discoverRouteMiddlewares; } });
Object.defineProperty(exports, "clearMiddlewareCaches", { enumerable: true, get: function () { return middleware_runner_1.clearMiddlewareCaches; } });
Object.defineProperty(exports, "buildNextRequest", { enumerable: true, get: function () { return middleware_runner_1.buildNextRequest; } });
Object.defineProperty(exports, "patternToRegExp", { enumerable: true, get: function () { return middleware_runner_1.patternToRegExp; } });
Object.defineProperty(exports, "shouldRunMiddleware", { enumerable: true, get: function () { return middleware_runner_1.shouldRunMiddleware; } });
