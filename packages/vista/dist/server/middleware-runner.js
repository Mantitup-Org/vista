"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearMiddlewareCaches = clearMiddlewareCaches;
exports.discoverGlobalMiddleware = discoverGlobalMiddleware;
exports.discoverRouteMiddlewares = discoverRouteMiddlewares;
exports.patternToRegExp = patternToRegExp;
exports.shouldRunMiddleware = shouldRunMiddleware;
exports.buildNextRequest = buildNextRequest;
exports.runMiddleware = runMiddleware;
exports.applyMiddlewareResult = applyMiddlewareResult;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ---------------------------------------------------------------------------
// Discovery Caches
// ---------------------------------------------------------------------------
const globalDiscoveryCache = new Map();
const routeDiscoveryCache = new Map();
const MIDDLEWARE_FILE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const ROUTE_FILE_STEMS = ['page', 'route', 'index', 'layout'];
function clearMiddlewareCaches() {
    globalDiscoveryCache.clear();
    routeDiscoveryCache.clear();
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getAppDir(cwd) {
    const candidates = [path_1.default.join(cwd, 'app'), path_1.default.join(cwd, 'src', 'app')];
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate) && fs_1.default.statSync(candidate).isDirectory()) {
            return candidate;
        }
    }
    return null;
}
/**
 * Discover top-level global middleware.
 * Checks `<cwd>/middleware.*` then `<cwd>/src/middleware.*`.
 */
function discoverGlobalMiddleware(cwd, bustCache) {
    if (!bustCache && globalDiscoveryCache.has(cwd)) {
        return globalDiscoveryCache.get(cwd);
    }
    const searchDirs = [cwd, path_1.default.join(cwd, 'src')];
    for (const dir of searchDirs) {
        for (const ext of MIDDLEWARE_FILE_EXTS) {
            const candidate = path_1.default.join(dir, `middleware${ext}`);
            if (fs_1.default.existsSync(candidate) && fs_1.default.statSync(candidate).isFile()) {
                globalDiscoveryCache.set(cwd, candidate);
                return candidate;
            }
        }
    }
    globalDiscoveryCache.set(cwd, null);
    return null;
}
/**
 * Discover route-specific middleware files along the path hierarchy.
 * Returns file paths from shallowest segment to deepest segment.
 */
function discoverRouteMiddlewares(cwd, pathname, bustCache) {
    const cacheKey = `${cwd}:${pathname}`;
    if (!bustCache && routeDiscoveryCache.has(cacheKey)) {
        return routeDiscoveryCache.get(cacheKey);
    }
    const appDir = getAppDir(cwd);
    if (!appDir) {
        routeDiscoveryCache.set(cacheKey, []);
        return [];
    }
    const globalMiddleware = discoverGlobalMiddleware(cwd, bustCache);
    const results = [];
    // 1. Check app/middleware.* (if different from global middleware)
    for (const ext of MIDDLEWARE_FILE_EXTS) {
        const appLevel = path_1.default.join(appDir, `middleware${ext}`);
        if (fs_1.default.existsSync(appLevel) && fs_1.default.statSync(appLevel).isFile() && appLevel !== globalMiddleware) {
            results.push(appLevel);
            break;
        }
    }
    // 2. Traverse route segments from root to leaf
    const segments = pathname.split('/').filter(Boolean);
    let currentDir = appDir;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        let nextDir = null;
        // Direct segment match (e.g. app/api)
        const exactDir = path_1.default.join(currentDir, seg);
        if (fs_1.default.existsSync(exactDir) && fs_1.default.statSync(exactDir).isDirectory()) {
            nextDir = exactDir;
        }
        else {
            // Dynamic route segment match (e.g. [id], [...slug])
            try {
                const entries = fs_1.default.readdirSync(currentDir, { withFileTypes: true });
                const dynamicEntry = entries.find((e) => e.isDirectory() &&
                    e.name.startsWith('[') &&
                    e.name.endsWith(']') &&
                    e.name !== '[not-found]');
                if (dynamicEntry) {
                    nextDir = path_1.default.join(currentDir, dynamicEntry.name);
                }
            }
            catch {
                // Ignore read errors
            }
        }
        if (!nextDir) {
            break;
        }
        currentDir = nextDir;
        // Check for co-located middleware in this segment directory
        for (const ext of MIDDLEWARE_FILE_EXTS) {
            const segmentMiddleware = path_1.default.join(currentDir, `middleware${ext}`);
            if (fs_1.default.existsSync(segmentMiddleware) &&
                fs_1.default.statSync(segmentMiddleware).isFile() &&
                segmentMiddleware !== globalMiddleware &&
                !results.includes(segmentMiddleware)) {
                results.push(segmentMiddleware);
                break;
            }
        }
    }
    // 3. At leaf directory, check for exported middleware in route files (page.tsx, route.ts, etc.)
    for (const stem of ROUTE_FILE_STEMS) {
        for (const ext of MIDDLEWARE_FILE_EXTS) {
            const candidateRouteFile = path_1.default.join(currentDir, `${stem}${ext}`);
            if (fs_1.default.existsSync(candidateRouteFile) &&
                fs_1.default.statSync(candidateRouteFile).isFile() &&
                !results.includes(candidateRouteFile)) {
                // Record candidate route file to inspect for exported middleware
                results.push(candidateRouteFile);
            }
        }
    }
    routeDiscoveryCache.set(cacheKey, results);
    return results;
}
// ---------------------------------------------------------------------------
// Matcher Support
// ---------------------------------------------------------------------------
function patternToRegExp(pattern) {
    // Convert Next.js-style / path pattern to RegExp:
    //   /foo/:path*  → /foo(?:/(.*))?
    //   /foo/:bar    → /foo/[^/]+
    //   /foo/*       → /foo(?:/(.*))?
    let re = pattern
        .replace(/\/:[^/]+\*/g, '(?:/(.*))?') // /:path* (0 or more sub-paths)
        .replace(/:[^/]+\*/g, '(.*)') // bare :path*
        .replace(/:[^/]+/g, '[^/]+') // :param (single segment)
        .replace(/\/\*/g, '(?:/(.*))?') // /*
        .replace(/\*/g, '(.*)'); // bare *
    return new RegExp(`^${re}/?$`);
}
function shouldRunMiddleware(middlewareModule, pathname) {
    const config = middlewareModule.config;
    if (!config?.matcher)
        return true;
    const matchers = Array.isArray(config.matcher) ? config.matcher : [config.matcher];
    return matchers.some((pattern) => {
        try {
            const re = patternToRegExp(pattern);
            return re.test(pathname);
        }
        catch {
            return true;
        }
    });
}
// ---------------------------------------------------------------------------
// Build NextRequest-like Object
// ---------------------------------------------------------------------------
function buildNextRequest(req) {
    const protocol = req.protocol || 'http';
    const host = (req.get && req.get('host')) || req.headers?.host || 'localhost';
    const rawPath = req.path || (req.url ? req.url.split('?')[0] : '/');
    const fullUrl = `${protocol}://${host}${req.originalUrl || req.url || rawPath}`;
    const headers = new Headers();
    if (req.headers) {
        for (const [key, val] of Object.entries(req.headers)) {
            if (val !== undefined) {
                if (Array.isArray(val)) {
                    for (const item of val) {
                        headers.append(key, item);
                    }
                }
                else {
                    headers.set(key, String(val));
                }
            }
        }
    }
    const queryParams = new URLSearchParams(typeof req.query === 'object' && req.query !== null
        ? req.query
        : {});
    // Cookie helpers
    const rawCookies = req.cookies || {};
    if (!Object.keys(rawCookies).length && req.headers?.cookie) {
        for (const pair of String(req.headers.cookie).split(';')) {
            const [k, ...v] = pair.split('=');
            const name = k?.trim();
            if (name) {
                rawCookies[name] = decodeURIComponent(v.join('=').trim());
            }
        }
    }
    return {
        url: fullUrl,
        method: req.method || 'GET',
        path: rawPath,
        headers,
        nextUrl: {
            pathname: rawPath,
            searchParams: queryParams,
            href: fullUrl,
            origin: `${protocol}://${host}`,
        },
        cookies: {
            get: (name) => rawCookies[name] !== undefined ? { name, value: String(rawCookies[name]) } : undefined,
            getAll: () => Object.entries(rawCookies).map(([n, v]) => ({
                name: n,
                value: v,
            })),
            has: (name) => rawCookies[name] !== undefined,
        },
    };
}
function cloneRequestWithHeaders(req, newHeaders) {
    const mergedHeaders = new Headers(req.headers);
    if (newHeaders instanceof Headers) {
        newHeaders.forEach((val, key) => mergedHeaders.set(key, val));
    }
    else {
        for (const [k, v] of Object.entries(newHeaders)) {
            mergedHeaders.set(k, String(v));
        }
    }
    return {
        ...req,
        headers: mergedHeaders,
    };
}
// ---------------------------------------------------------------------------
// Execution Pipeline
// ---------------------------------------------------------------------------
function loadModule(filePath, isDev) {
    try {
        if (isDev) {
            try {
                delete require.cache[require.resolve(filePath)];
            }
            catch { }
        }
        return require(filePath);
    }
    catch (err) {
        console.warn(`[vista:middleware] Failed to load middleware module ${filePath}:`, err?.message);
        return null;
    }
}
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
async function runMiddleware(req, cwd, isDev = false) {
    const pathname = req.path || (req.url ? req.url.split('?')[0] : '/');
    // 1. Discover Global Middleware
    const globalFile = discoverGlobalMiddleware(cwd, isDev);
    const entries = [];
    if (globalFile) {
        entries.push({
            source: 'global',
            filePath: globalFile,
            depth: 0,
        });
    }
    // 2. Discover Route-Specific Middlewares
    const routeFiles = discoverRouteMiddlewares(cwd, pathname, isDev);
    for (let i = 0; i < routeFiles.length; i++) {
        const file = routeFiles[i];
        const isMiddlewareFile = path_1.default.basename(file).startsWith('middleware.');
        entries.push({
            source: isMiddlewareFile ? 'segment' : 'route',
            filePath: file,
            depth: i + 1,
        });
    }
    // If no middleware discovered, skip directly
    if (entries.length === 0) {
        return { kind: 'skip' };
    }
    const activeChain = [];
    for (const entry of entries) {
        const mod = loadModule(entry.filePath, isDev);
        if (!mod)
            continue;
        // In a route file (e.g. page.tsx, route.ts), we ONLY accept an explicit `export const middleware`
        // or `export function middleware` (not `export default`, which is the page component)
        let fn;
        if (entry.source === 'route') {
            if (typeof mod.middleware === 'function') {
                fn = mod.middleware;
            }
        }
        else {
            // In a dedicated middleware.* file, accept either `export default` or `export function middleware`
            if (typeof mod.middleware === 'function') {
                fn = mod.middleware;
            }
            else if (typeof mod.default === 'function') {
                fn = mod.default;
            }
        }
        if (!fn)
            continue;
        // Check optional matcher config
        if (!shouldRunMiddleware(mod, pathname)) {
            continue;
        }
        activeChain.push({
            filePath: entry.filePath,
            source: entry.source,
            fn,
        });
    }
    if (activeChain.length === 0) {
        return { kind: 'skip' };
    }
    // 4. Execute the chain
    let currentRequest = buildNextRequest(req);
    const aggregatedResponseHeaders = new Map();
    const modifiedRequestHeaders = new Map();
    async function dispatch(index, requestObj) {
        if (index >= activeChain.length) {
            // Terminal node: reached end of middleware chain
            return new Response(null, {
                status: 200,
                headers: {
                    'x-middleware-next': '1',
                },
            });
        }
        const currentItem = activeChain[index];
        let nextCalled = false;
        let nextRequestObj = requestObj;
        const nextFn = async (options) => {
            nextCalled = true;
            if (options?.request?.headers) {
                nextRequestObj = cloneRequestWithHeaders(requestObj, options.request.headers);
                // Track modified request headers
                if (options.request.headers instanceof Headers) {
                    options.request.headers.forEach((v, k) => modifiedRequestHeaders.set(k.toLowerCase(), v));
                }
                else {
                    for (const [k, v] of Object.entries(options.request.headers)) {
                        modifiedRequestHeaders.set(k.toLowerCase(), String(v));
                    }
                }
            }
            return dispatch(index + 1, nextRequestObj);
        };
        const context = {
            request: requestObj,
            next: nextFn,
            url: requestObj.url,
            method: requestObj.method,
            headers: requestObj.headers,
            nextUrl: requestObj.nextUrl,
            cookies: requestObj.cookies,
        };
        try {
            // Invoke middleware. Supports:
            //  - middleware({ request, next }) [Issue #7 Part 5 signature]
            //  - middleware(request, next)
            //  - middleware(request)
            const output = await currentItem.fn(context, nextFn);
            // Handle direct Response return
            if (output instanceof Response) {
                return output;
            }
            // If next() was explicitly called and returned nothing, propagate standard continuation
            if (nextCalled) {
                return new Response(null, {
                    status: 200,
                    headers: {
                        'x-middleware-next': '1',
                    },
                });
            }
            // If middleware returned void without calling next(), continue to next in chain
            return dispatch(index + 1, requestObj);
        }
        catch (err) {
            console.error(`[vista:middleware] Error in middleware at ${currentItem.filePath}:`, err?.message ?? String(err));
            // On error, let request continue rather than completely hanging
            return dispatch(index + 1, requestObj);
        }
    }
    const finalResponse = await dispatch(0, currentRequest);
    // 5. Convert final Response to MiddlewareResult
    // Collect all response headers
    if (finalResponse.headers && typeof finalResponse.headers.forEach === 'function') {
        finalResponse.headers.forEach((val, key) => {
            aggregatedResponseHeaders.set(key, val);
        });
    }
    // 5a. Redirect
    const location = finalResponse.headers?.get?.('Location') || finalResponse.headers?.get?.('location');
    if (location) {
        return {
            kind: 'redirect',
            status: finalResponse.status || 307,
            location,
            responseHeaders: aggregatedResponseHeaders,
            requestHeaders: modifiedRequestHeaders,
        };
    }
    // 5b. Rewrite
    const rewrite = finalResponse.headers?.get?.('x-middleware-rewrite');
    if (rewrite) {
        return {
            kind: 'rewrite',
            location: rewrite,
            responseHeaders: aggregatedResponseHeaders,
            requestHeaders: modifiedRequestHeaders,
        };
    }
    // 5c. Continue to page/route handler
    const shouldContinue = finalResponse.headers?.get?.('x-middleware-next');
    if (shouldContinue) {
        return {
            kind: 'next',
            responseHeaders: aggregatedResponseHeaders,
            requestHeaders: modifiedRequestHeaders,
        };
    }
    // 5d. Short-circuit with response body and custom status
    let bodyContent = null;
    try {
        bodyContent = await finalResponse.text();
    }
    catch { }
    return {
        kind: 'short-circuit',
        status: finalResponse.status || 200,
        responseHeaders: aggregatedResponseHeaders,
        requestHeaders: modifiedRequestHeaders,
        body: bodyContent,
    };
}
// ---------------------------------------------------------------------------
// Apply Middleware Result
// ---------------------------------------------------------------------------
/**
 * Apply a MiddlewareResult to the Express request/response.
 * Returns `true` if the response was finalized (caller should `return`),
 * `false` if the request should continue to the next handler.
 */
function applyMiddlewareResult(result, req, res) {
    // 1. Forward any modified request headers to req.headers
    if (result.requestHeaders && req.headers) {
        result.requestHeaders.forEach((value, key) => {
            req.headers[key.toLowerCase()] = value;
        });
    }
    // 2. Forward any response headers the middleware set
    if (result.responseHeaders) {
        result.responseHeaders.forEach((value, key) => {
            const lower = key.toLowerCase();
            // Skip internal transport headers
            if (lower === 'x-middleware-next' || lower === 'x-middleware-rewrite' || lower === 'location') {
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
        case 'short-circuit': {
            const status = result.status || 403;
            if (result.body !== undefined && result.body !== null && result.body !== '') {
                res.status(status).send(result.body);
            }
            else {
                res.status(status).end();
            }
            return true;
        }
        case 'next':
        case 'skip':
        default:
            return false; // continue
    }
}
