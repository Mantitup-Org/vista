"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMiddleware = runMiddleware;
exports.applyMiddlewareResult = applyMiddlewareResult;
exports.listMiddlewareFiles = listMiddlewareFiles;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const MIDDLEWARE_FILENAMES = ['middleware.ts', 'middleware.tsx', 'middleware.js', 'middleware.jsx'];
const discoveryCache = new Map();
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
function patternToRegExp(pattern) {
    let re = pattern
        .replace(/:[^/]+\*/g, '(.*)')
        .replace(/:[^/]+/g, '[^/]+')
        .replace(/\*/g, '(.*)');
    return new RegExp(`^${re}(/)?$`);
}
function shouldRunMiddleware(middlewareModule, pathname) {
    const config = middlewareModule.config;
    if (!config?.matcher)
        return true;
    const matchers = Array.isArray(config.matcher) ? config.matcher : [config.matcher];
    return matchers.some((pattern) => patternToRegExp(pattern).test(pathname));
}
function firstExistingFile(candidates) {
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate))
            return candidate;
    }
    return null;
}
function collectMiddlewareFiles(cwd, pathname, bustCache) {
    const cacheKey = `${cwd}::${pathname}`;
    if (!bustCache && discoveryCache.has(cacheKey)) {
        return discoveryCache.get(cacheKey);
    }
    const files = [];
    const seen = new Set();
    const add = (filePath) => {
        if (!filePath || seen.has(filePath))
            return;
        seen.add(filePath);
        files.push(filePath);
    };
    add(firstExistingFile(MIDDLEWARE_FILENAMES.map((name) => path_1.default.resolve(cwd, name))));
    add(firstExistingFile(MIDDLEWARE_FILENAMES.map((name) => path_1.default.resolve(cwd, 'src', name))));
    const segments = String(pathname || '/')
        .split('/')
        .filter(Boolean);
    const appRoots = [path_1.default.resolve(cwd, 'app'), path_1.default.resolve(cwd, 'src', 'app')].filter((dir) => fs_1.default.existsSync(dir));
    for (const appRoot of appRoots) {
        add(firstExistingFile(MIDDLEWARE_FILENAMES.map((name) => path_1.default.join(appRoot, name))));
        let current = appRoot;
        for (const segment of segments) {
            current = path_1.default.join(current, segment);
            add(firstExistingFile(MIDDLEWARE_FILENAMES.map((name) => path_1.default.join(current, name))));
        }
    }
    discoveryCache.set(cacheKey, files);
    return files;
}
function interpretMiddlewareResponse(response, nextCalled) {
    if (!response) {
        return nextCalled ? { kind: 'next' } : { kind: 'next' };
    }
    const responseHeaders = new Map();
    if (response.headers && typeof response.headers.forEach === 'function') {
        response.headers.forEach((value, key) => {
            responseHeaders.set(key, value);
        });
    }
    const location = response.headers?.get?.('Location') || response.headers?.get?.('location');
    if (location) {
        return {
            kind: 'redirect',
            status: response.status || 307,
            location,
            responseHeaders,
        };
    }
    const rewrite = response.headers?.get?.('x-middleware-rewrite');
    if (rewrite) {
        return {
            kind: 'rewrite',
            location: rewrite,
            responseHeaders,
        };
    }
    const shouldContinue = response.headers?.get?.('x-middleware-next');
    if (shouldContinue || nextCalled) {
        return { kind: 'next', responseHeaders };
    }
    if (response.status && response.status !== 200) {
        return {
            kind: 'short-circuit',
            status: response.status,
            responseHeaders,
            body: typeof response.bodyUsed === 'boolean' && !response.bodyUsed ? undefined : undefined,
        };
    }
    return { kind: 'next', responseHeaders };
}
async function invokeMiddlewareModule(middlewareFile, req, isDev) {
    try {
        if (isDev) {
            try {
                delete require.cache[require.resolve(middlewareFile)];
            }
            catch {
                return { kind: 'skip' };
            }
        }
        const middlewareModule = require(middlewareFile);
        const middleware = middlewareModule.default || middlewareModule.middleware;
        if (typeof middleware !== 'function') {
            return { kind: 'skip' };
        }
        if (!shouldRunMiddleware(middlewareModule, req.path)) {
            return { kind: 'skip' };
        }
        let nextCalled = false;
        const next = async () => {
            nextCalled = true;
            const response = new Response(null, { status: 200 });
            response.headers.set('x-middleware-next', '1');
            return response;
        };
        const vistaRequest = buildNextRequest(req);
        const hybrid = Object.assign(vistaRequest, {
            request: vistaRequest,
            next,
        });
        let response;
        try {
            response = await middleware(hybrid, next);
        }
        catch {
            response = await middleware({ request: vistaRequest, next });
        }
        if (response instanceof Promise) {
            response = await response;
        }
        return interpretMiddlewareResponse(response, nextCalled);
    }
    catch (err) {
        console.error(`[vista] Middleware error in ${path_1.default.basename(middlewareFile)}: ${err?.message ?? String(err)}`);
        return { kind: 'next' };
    }
}
async function runMiddleware(req, cwd, isDev) {
    const files = collectMiddlewareFiles(cwd, req.path, isDev);
    if (files.length === 0) {
        return { kind: 'skip' };
    }
    const mergedHeaders = new Map();
    for (const file of files) {
        const result = await invokeMiddlewareModule(file, req, isDev);
        if (result.responseHeaders) {
            result.responseHeaders.forEach((value, key) => mergedHeaders.set(key, value));
        }
        if (result.kind === 'skip' || result.kind === 'next') {
            continue;
        }
        return {
            ...result,
            responseHeaders: mergedHeaders,
        };
    }
    return {
        kind: 'next',
        responseHeaders: mergedHeaders.size > 0 ? mergedHeaders : undefined,
    };
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
            res.status(result.status || 403);
            if (result.body) {
                res.send(result.body);
            }
            else {
                res.end();
            }
            return true;
        case 'next':
        case 'skip':
        default:
            return false;
    }
}
function listMiddlewareFiles(cwd, pathname) {
    return collectMiddlewareFiles(cwd, pathname, true);
}
