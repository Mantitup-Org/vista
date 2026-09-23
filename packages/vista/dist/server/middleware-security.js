"use strict";
/**
 * Middleware security primitives.
 *
 * These are Next-inspired helpers that apps can compose in `middleware.ts`.
 * The runner also uses the redirect/header sanitizers internally.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORBIDDEN_REQUEST_HEADERS = void 0;
exports.isForbiddenRequestHeader = isForbiddenRequestHeader;
exports.sanitizeRequestHeaderMap = sanitizeRequestHeaderMap;
exports.isSafeRedirectLocation = isSafeRedirectLocation;
exports.isSafeRewriteLocation = isSafeRewriteLocation;
exports.securityHeaders = securityHeaders;
exports.cors = cors;
exports.rateLimit = rateLimit;
exports.chain = chain;
exports.FORBIDDEN_REQUEST_HEADERS = new Set([
    'host',
    'cookie',
    'content-length',
    'content-type',
    'transfer-encoding',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-forwarded-port',
    'x-real-ip',
    'x-middleware-next',
    'x-middleware-rewrite',
]);
function isForbiddenRequestHeader(name) {
    return exports.FORBIDDEN_REQUEST_HEADERS.has(name.toLowerCase());
}
function sanitizeRequestHeaderMap(headers) {
    const sanitized = new Map();
    const append = (key, value) => {
        if (!isForbiddenRequestHeader(key)) {
            sanitized.set(key.toLowerCase(), value);
        }
    };
    if (headers instanceof Map) {
        headers.forEach((value, key) => append(key, value));
    }
    else if (typeof headers.forEach === 'function' && !Array.isArray(headers)) {
        headers.forEach((value, key) => append(key, value));
    }
    else {
        for (const [key, value] of Object.entries(headers)) {
            append(key, value);
        }
    }
    return sanitized;
}
function isSafeRedirectLocation(location, requestUrl, allowedHosts = []) {
    const trimmed = String(location || '').trim();
    if (!trimmed)
        return false;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
        return !trimmed.includes('://');
    }
    try {
        const base = new URL(requestUrl);
        const target = new URL(trimmed, base);
        if (target.origin === base.origin) {
            return true;
        }
        const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
        return allowed.has(target.host.toLowerCase());
    }
    catch {
        return false;
    }
}
function isSafeRewriteLocation(location) {
    const trimmed = String(location || '').trim();
    if (!trimmed)
        return false;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
        return !trimmed.includes('://');
    }
    return false;
}
function securityHeaders(init = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has('X-Content-Type-Options'))
        headers.set('X-Content-Type-Options', 'nosniff');
    if (!headers.has('X-Frame-Options'))
        headers.set('X-Frame-Options', 'DENY');
    if (!headers.has('Referrer-Policy'))
        headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!headers.has('X-DNS-Prefetch-Control'))
        headers.set('X-DNS-Prefetch-Control', 'off');
    if (!headers.has('Permissions-Policy')) {
        headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    }
    if (process.env.NODE_ENV === 'production' && !headers.has('Strict-Transport-Security')) {
        headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return headers;
}
function cors(options = {}) {
    const origin = options.origin ?? '*';
    const methods = (options.methods ?? ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).join(', ');
    const allowHeaders = (options.headers ?? ['Content-Type', 'Authorization']).join(', ');
    return (request) => {
        const headers = new Headers();
        const requestOrigin = request.headers.get('origin');
        if (origin === '*') {
            if (options.credentials && requestOrigin) {
                // `Access-Control-Allow-Origin: *` is invalid together with
                // `Allow-Credentials: true` (browsers reject the response), so reflect
                // the caller's origin instead when credentials are enabled.
                headers.set('Access-Control-Allow-Origin', requestOrigin);
                headers.set('Vary', 'Origin');
            }
            else {
                headers.set('Access-Control-Allow-Origin', '*');
            }
        }
        else if (Array.isArray(origin)) {
            if (requestOrigin && origin.includes(requestOrigin)) {
                headers.set('Access-Control-Allow-Origin', requestOrigin);
                headers.set('Vary', 'Origin');
            }
        }
        else if (origin) {
            headers.set('Access-Control-Allow-Origin', origin);
        }
        headers.set('Access-Control-Allow-Methods', methods);
        headers.set('Access-Control-Allow-Headers', allowHeaders);
        if (options.credentials) {
            headers.set('Access-Control-Allow-Credentials', 'true');
        }
        if (options.maxAge != null) {
            headers.set('Access-Control-Max-Age', String(options.maxAge));
        }
        return headers;
    };
}
const rateLimitStores = new Map();
function rateLimit(options = {}) {
    const limit = options.limit ?? 60;
    const windowMs = options.windowMs ?? 60_000;
    const storeKey = options.key ?? 'default';
    if (!rateLimitStores.has(storeKey)) {
        rateLimitStores.set(storeKey, new Map());
    }
    const store = rateLimitStores.get(storeKey);
    return (request) => {
        const identifier = options.identifier?.(request) ||
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.ip ||
            'anonymous';
        const now = Date.now();
        const bucket = store.get(identifier) || { tokens: limit, updatedAt: now };
        const elapsed = now - bucket.updatedAt;
        const refill = (elapsed / windowMs) * limit;
        bucket.tokens = Math.min(limit, bucket.tokens + refill);
        bucket.updatedAt = now;
        if (bucket.tokens < 1) {
            store.set(identifier, bucket);
            return { ok: false, remaining: 0 };
        }
        bucket.tokens -= 1;
        store.set(identifier, bucket);
        return { ok: true, remaining: Math.floor(bucket.tokens) };
    };
}
function chain(middlewares) {
    return async (context) => {
        const originalNext = context.next;
        let index = -1;
        const dispatch = async (current) => {
            if (current <= index) {
                throw new Error('next() called multiple times');
            }
            index = current;
            const fn = middlewares[current];
            if (!fn) {
                return originalNext();
            }
            const next = async () => dispatch(current + 1);
            const result = await fn({ ...context, next });
            if (result instanceof Response) {
                return result;
            }
            return next();
        };
        return dispatch(0);
    };
}
