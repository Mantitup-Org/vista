"use strict";
/**
 * Vista Middleware Runner
 *
 * Shared middleware execution logic used by both the standard SSR engine
 * and the RSC engine. Discovers `middleware.ts` / `.tsx` / `.js` at the
 * project root, constructs a NextRequest-like object from the Express
 * request, invokes the user middleware, and returns a disposition that
 * the caller can act on.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMiddleware = runMiddleware;
exports.applyMiddlewareResult = applyMiddlewareResult;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ---------------------------------------------------------------------------
// Middleware discovery cache (per-cwd)
// ---------------------------------------------------------------------------
const discoveryCache = new Map();
function discoverMiddleware(cwd, bustCache) {
    if (!bustCache && discoveryCache.has(cwd)) {
        return discoveryCache.get(cwd);
    }
    const candidates = [
        path_1.default.resolve(cwd, 'middleware.ts'),
        path_1.default.resolve(cwd, 'middleware.tsx'),
        path_1.default.resolve(cwd, 'middleware.js'),
        path_1.default.resolve(cwd, 'src', 'middleware.ts'),
        path_1.default.resolve(cwd, 'src', 'middleware.tsx'),
        path_1.default.resolve(cwd, 'src', 'middleware.js'),
    ];
    for (const p of candidates) {
        if (fs_1.default.existsSync(p)) {
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
function buildMiddlewareRequest(req) {
    const protocol = req.protocol || 'http';
    const host = (typeof req.get === 'function' ? req.get('host') : req.headers?.host) || 'localhost';
    const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;
    const requestUrl = new URL(fullUrl);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers || {})) {
        if (Array.isArray(v)) {
            for (const item of v)
                headers.append(k, item);
        }
        else if (v !== undefined) {
            headers.set(k, String(v));
        }
    }
    const cookieMap = new Map();
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        for (const cookie of cookieHeader.split(';')) {
            const [name, ...val] = cookie.trim().split('=');
            if (name) {
                try {
                    cookieMap.set(name, decodeURIComponent(val.join('=')));
                }
                catch {
                    // Ignore malformed percent-encoded cookie values; do not abort middleware.
                    cookieMap.set(name, val.join('='));
                }
            }
        }
    }
    const cookies = {
        get: (name) => cookieMap.has(name) ? { name, value: cookieMap.get(name) } : undefined,
        getAll: () => Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value })),
        has: (name) => cookieMap.has(name),
    };
    const nextUrl = {
        pathname: req.path || requestUrl.pathname,
        searchParams: requestUrl.searchParams,
        href: fullUrl,
        origin: requestUrl.origin,
    };
    let webRequest;
    try {
        // Include a body stream for methods that carry a body (POST, PUT, PATCH, DELETE).
        // Omitting body: null for GET/HEAD is required per the Fetch spec.
        const methodAllowsBody = !['GET', 'HEAD'].includes((req.method || '').toUpperCase());
        let bodyInit = null;
        if (methodAllowsBody) {
            // Convert the Express Readable stream to a Web ReadableStream
            bodyInit = new ReadableStream({
                start(controller) {
                    req.on('data', (chunk) => {
                        controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                    });
                    req.once('end', () => controller.close());
                    req.once('error', (err) => controller.error(err));
                },
            });
        }
        webRequest = new Request(fullUrl, {
            method: req.method,
            headers,
            body: bodyInit,
            // Required to pipe a stream body through the Web Fetch Request constructor
            ...(bodyInit ? { duplex: 'half' } : {}),
        });
    }
    catch {
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
function shouldRunMiddleware(middlewareModule, pathname) {
    const config = middlewareModule.config;
    if (!config?.matcher)
        return true;
    const matchers = Array.isArray(config.matcher) ? config.matcher : [config.matcher];
    return matchers.some((pattern) => {
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
                }
                catch {
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
            }
            catch {
                return false;
            }
        }
        return true;
    });
}
const patternRegexCache = new Map();
const MAX_PATTERN_CACHE_SIZE = 512;
function patternToRegExp(pattern) {
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
async function runMiddleware(req, cwd, isDev) {
    const middlewareFile = discoverMiddleware(cwd, isDev);
    if (!middlewareFile) {
        return { kind: 'skip' };
    }
    try {
        if (isDev) {
            try {
                delete require.cache[require.resolve(middlewareFile)];
            }
            catch {
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
        const injectedRequestHeaders = new Map();
        const nextFn = (options) => {
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
        const responseHeaders = new Map();
        if (response.headers && typeof response.headers.forEach === 'function') {
            response.headers.forEach((value, key) => {
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
            let body;
            try {
                const ab = await response.arrayBuffer();
                if (ab.byteLength > 0) {
                    body = Buffer.from(ab);
                }
            }
            catch {
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
    }
    catch (err) {
        console.error(`[vista] Middleware error: ${err?.message ?? String(err)}`);
        return { kind: 'next' };
    }
}
function applyMiddlewareResult(result, req, res) {
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
            res.redirect(result.status || 307, result.location);
            return true;
        case 'rewrite':
            req.url = result.location;
            return false;
        case 'short-circuit':
            if (result.body) {
                res.status(result.status || 403).send(result.body);
            }
            else {
                res.status(result.status || 403).end();
            }
            return true;
        case 'next':
        case 'skip':
        default:
            return false;
    }
}
