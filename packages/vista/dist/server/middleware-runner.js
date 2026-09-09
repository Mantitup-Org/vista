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
let allMiddlewaresCache = new Map();
function discoverAllMiddlewares(cwd, bustCache) {
    if (!bustCache && allMiddlewaresCache.has(cwd)) {
        return allMiddlewaresCache.get(cwd);
    }
    const results = [];
    const candidates = ['middleware.ts', 'middleware.tsx', 'middleware.js'];
    // 1. Global middleware (root)
    for (const ext of candidates) {
        const p = path_1.default.join(cwd, ext);
        if (fs_1.default.existsSync(p)) {
            results.push({ filePath: p, prefix: '/' });
            break; // Only pick one at the root
        }
    }
    // 2. Nested middleware (app/)
    const appDir = path_1.default.join(cwd, 'app');
    if (fs_1.default.existsSync(appDir)) {
        const walk = (dir) => {
            for (const ext of candidates) {
                const p = path_1.default.join(dir, ext);
                if (fs_1.default.existsSync(p)) {
                    const relative = path_1.default.relative(appDir, dir).replace(/\\/g, '/');
                    const prefix = computeMiddlewarePrefix(relative);
                    results.push({ filePath: p, prefix });
                    break; // Only pick one per directory
                }
            }
            const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    walk(path_1.default.join(dir, entry.name));
                }
            }
        };
        walk(appDir);
    }
    // Sort by prefix depth (shallowest first, so root runs first)
    results.sort((a, b) => {
        const depthA = a.prefix === '/' ? 0 : a.prefix.split('/').length;
        const depthB = b.prefix === '/' ? 0 : b.prefix.split('/').length;
        return depthA - depthB;
    });
    allMiddlewaresCache.set(cwd, results);
    return results;
}
function computeMiddlewarePrefix(relativeAppPath) {
    if (!relativeAppPath)
        return '/';
    const segments = relativeAppPath.split('/');
    const processed = segments
        .filter((seg) => !(seg.startsWith('(') && seg.endsWith(')'))) // Remove route groups
        .map((seg) => {
        if (seg.startsWith('[...') && seg.endsWith(']')) {
            return '(.*)'; // Catch-all
        }
        if (seg.startsWith('[') && seg.endsWith(']')) {
            return `:${seg.slice(1, -1)}`; // Dynamic param
        }
        return seg;
    });
    if (processed.length === 0)
        return '/';
    return '/' + processed.join('/');
}
// ---------------------------------------------------------------------------
// Build NextRequest-like object
// ---------------------------------------------------------------------------
function buildNextRequest(req) {
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost';
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;
    return {
        url: fullUrl,
        method: req.method,
        headers: new Map(Object.entries(req.headers)),
        nextUrl: {
            pathname: req.path,
            searchParams: new URLSearchParams(req.query),
            href: fullUrl,
            origin: `${protocol}://${host}`,
        },
        cookies: {
            get: (name) => req.cookies?.[name] ? { name, value: req.cookies[name] } : undefined,
            getAll: () => Object.entries(req.cookies || {}).map(([n, v]) => ({
                name: n,
                value: v,
            })),
            has: (name) => !!req.cookies?.[name],
        },
    };
}
// ---------------------------------------------------------------------------
// Matcher support
// ---------------------------------------------------------------------------
/**
 * Evaluate the optional `config.matcher` exported alongside the middleware,
 * or fallback to the auto-generated directory prefix matcher.
 */
function shouldRunMiddleware(middlewareModule, pathname, prefix) {
    const config = middlewareModule.config;
    if (config?.matcher) {
        const matchers = Array.isArray(config.matcher) ? config.matcher : [config.matcher];
        return matchers.some((pattern) => patternToRegExp(pattern).test(pathname));
    }
    else {
        const autoPattern = prefix === '/' ? '/(.*)' : `${prefix}(/.*)?`;
        return patternToRegExp(autoPattern).test(pathname);
    }
}
function patternToRegExp(pattern) {
    let re = pattern
        .replace(/:[a-zA-Z0-9_]+\*/g, '(.*)') // :path*
        .replace(/:[a-zA-Z0-9_]+/g, '[^/]+') // :param
        .replace(/\*/g, '(.*)'); // bare *
    return new RegExp(`^${re}(/)?$`);
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Run a chain of user-defined middlewares for the given request.
 */
async function runMiddleware(req, cwd, isDev) {
    const middlewares = discoverAllMiddlewares(cwd, isDev);
    if (middlewares.length === 0) {
        return { kind: 'skip' };
    }
    const accumulatedHeaders = new Map();
    let nextRequest = buildNextRequest(req);
    for (const mwDef of middlewares) {
        try {
            if (isDev) {
                try {
                    delete require.cache[require.resolve(mwDef.filePath)];
                }
                catch {
                    continue;
                }
            }
            const middlewareModule = require(mwDef.filePath);
            const middleware = middlewareModule.default || middlewareModule.middleware;
            if (typeof middleware !== 'function') {
                continue;
            }
            if (!shouldRunMiddleware(middlewareModule, req.path, mwDef.prefix)) {
                continue;
            }
            // Inject accumulated headers into the request so downstream middleware sees them
            accumulatedHeaders.forEach((val, key) => {
                nextRequest.headers.set(key, val);
            });
            const response = await middleware(nextRequest);
            if (!response) {
                continue; // Implicit next()
            }
            // Collect new response headers
            if (response.headers && typeof response.headers.forEach === 'function') {
                response.headers.forEach((value, key) => {
                    accumulatedHeaders.set(key, value);
                });
            }
            // 1. Redirect
            const location = response.headers?.get?.('Location');
            if (location) {
                return {
                    kind: 'redirect',
                    status: response.status || 307,
                    location,
                    responseHeaders: accumulatedHeaders,
                };
            }
            // 2. Rewrite
            const rewrite = response.headers?.get?.('x-middleware-rewrite');
            if (rewrite) {
                return {
                    kind: 'rewrite',
                    location: rewrite,
                    responseHeaders: accumulatedHeaders,
                };
            }
            // 3. Short-circuit (non-200)
            if (response.status && response.status !== 200) {
                return {
                    kind: 'short-circuit',
                    status: response.status,
                    responseHeaders: accumulatedHeaders,
                };
            }
            // 4. Continue (Next)
            // We loop to the next middleware.
        }
        catch (err) {
            console.error(`[vista] Middleware error in ${mwDef.filePath}: ${err?.message ?? String(err)}`);
            // On error, let the request continue rather than crashing
        }
    }
    return { kind: 'next', responseHeaders: accumulatedHeaders };
}
/**
 * Apply a MiddlewareResult to the Express request/response.
 * Returns `true` if the response was finalized (caller should `return`),
 * `false` if the request should continue to the next handler.
 */
function applyMiddlewareResult(result, req, res) {
    // Forward any response headers the middleware set
    if (result.responseHeaders) {
        result.responseHeaders.forEach((value, key) => {
            // Skip internal headers
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
            return false; // continue with rewritten URL
        case 'short-circuit':
            res.status(result.status || 403).end();
            return true;
        case 'next':
        case 'skip':
        default:
            return false; // continue
    }
}
