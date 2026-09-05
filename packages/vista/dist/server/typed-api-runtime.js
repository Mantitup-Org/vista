"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRouteHandler = resolveRouteHandler;
exports.resolveLegacyApiRoutePath = resolveLegacyApiRoutePath;
exports.resolveLegacyRouteHandlerPath = resolveLegacyRouteHandlerPath;
exports.createParamsContext = createParamsContext;
exports.runRouteHandler = runRouteHandler;
exports.runLegacyApiRoute = runLegacyApiRoute;
exports.runTypedApiRoute = runTypedApiRoute;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const server_1 = require("../stack/server");
const segment_config_1 = require("./segment-config");
const request_context_1 = require("./request-context");
const TYPED_API_ENTRYPOINTS = [
    path_1.default.join('app', 'api', 'typed.ts'),
    path_1.default.join('app', 'api', 'typed.tsx'),
    path_1.default.join('app', 'api', 'typed.js'),
    path_1.default.join('app', 'api', 'typed.jsx'),
    path_1.default.join('app', 'typed-api.ts'),
    path_1.default.join('app', 'typed-api.tsx'),
    path_1.default.join('app', 'typed-api.js'),
    path_1.default.join('app', 'typed-api.jsx'),
];
const METADATA_ROUTE_MAPPINGS = [
    { requestPath: '/robots.txt', stem: 'robots' },
    { requestPath: '/sitemap.xml', stem: 'sitemap' },
    { requestPath: '/manifest.webmanifest', stem: 'manifest' },
];
const ROUTE_FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
class BodyLimitError extends Error {
    status = 413;
    constructor(limitBytes) {
        super(`Typed API body exceeds configured limit (${limitBytes} bytes)`);
        this.name = 'BodyLimitError';
    }
}
class BodyParseError extends Error {
    status = 400;
    constructor(message) {
        super(message);
        this.name = 'BodyParseError';
    }
}
function isStackRouterLike(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value;
    return (!!candidate.procedures &&
        !!candidate.routes &&
        !!candidate.metadata &&
        typeof candidate.resolve === 'function');
}
function resolveTypedRouterFromModule(mod) {
    const candidates = [
        mod?.default,
        mod?.router,
        mod?.typedRouter,
        mod?.api,
        typeof mod?.createRouter === 'function' ? mod.createRouter() : null,
        typeof mod?.createTypedRouter === 'function' ? mod.createTypedRouter() : null,
    ];
    for (const candidate of candidates) {
        if (isStackRouterLike(candidate)) {
            return candidate;
        }
    }
    return null;
}
function normalizeApiPath(pathname) {
    if (!pathname.startsWith('/api')) {
        return pathname || '/';
    }
    const stripped = pathname.slice('/api'.length);
    return stripped ? stripped : '/';
}
function buildPathCandidates(pathname) {
    const normalized = pathname || '/';
    const apiNormalized = normalizeApiPath(normalized);
    const dedup = new Set([normalized, apiNormalized]);
    return Array.from(dedup);
}
function normalizeRouteRequestPath(requestPath) {
    const normalized = String(requestPath || '/').split('?')[0].replace(/\\/g, '/');
    if (normalized === '/' || normalized === '') {
        return '';
    }
    return normalized.replace(/^\/+/, '').replace(/\/+$/, '');
}
function isRouteGroupDirectory(name) {
    return /^\([\w-]+\)$/.test(name);
}
function resolveMetadataRoutePath(cwdOrAppDir, stem) {
    const appDir = path_1.default.basename(cwdOrAppDir) === 'app'
        ? cwdOrAppDir
        : path_1.default.resolve(cwdOrAppDir, 'app');
    if (!fs_1.default.existsSync(appDir)) {
        return null;
    }
    const tryStemInDirectory = (dir) => {
        for (const extension of ROUTE_FILE_EXTENSIONS) {
            const candidate = path_1.default.join(dir, `${stem}${extension}`);
            if (fs_1.default.existsSync(candidate)) {
                return candidate;
            }
        }
        return null;
    };
    const directMatch = tryStemInDirectory(appDir);
    if (directMatch) {
        return directMatch;
    }
    const searchGroupDirectories = (dir) => {
        const entries = fs_1.default
            .readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && isRouteGroupDirectory(entry.name))
            .sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            const groupDir = path_1.default.join(dir, entry.name);
            const match = tryStemInDirectory(groupDir);
            if (match) {
                return match;
            }
            const nestedMatch = searchGroupDirectories(groupDir);
            if (nestedMatch) {
                return nestedMatch;
            }
        }
        return null;
    };
    return searchGroupDirectories(appDir);
}
function hasMethodMatch(router, pathname, method) {
    const normalized = method.toLowerCase();
    return router.resolve(pathname, normalized) !== null;
}
function hasRouteForAnyMethod(router, pathname) {
    return hasMethodMatch(router, pathname, 'get') || hasMethodMatch(router, pathname, 'post');
}
async function parseRequestBody(req, bodySizeLimitBytes) {
    if (req.method === 'GET' || req.method === 'HEAD') {
        return undefined;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > bodySizeLimitBytes) {
            throw new BodyLimitError(bodySizeLimitBytes);
        }
        chunks.push(buffer);
    }
    if (chunks.length === 0) {
        return undefined;
    }
    const raw = Buffer.concat(chunks);
    const contentType = String(req.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
    if (!contentType || contentType === 'application/json' || contentType.endsWith('+json')) {
        try {
            return JSON.parse(raw.toString('utf-8'));
        }
        catch {
            throw new BodyParseError('Invalid JSON body for typed API request.');
        }
    }
    if (contentType === 'application/x-www-form-urlencoded') {
        return Object.fromEntries(new URLSearchParams(raw.toString('utf-8')).entries());
    }
    if (contentType.startsWith('text/')) {
        return raw.toString('utf-8');
    }
    return raw;
}
async function sendFetchResponse(res, response, options) {
    const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : null;
    response.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie' && Array.isArray(setCookies) && setCookies.length > 0) {
            return;
        }
        res.setHeader(key, value);
    });
    if (Array.isArray(setCookies) && setCookies.length > 0) {
        res.setHeader('Set-Cookie', setCookies);
    }
    res.status(response.status);
    if (options?.isHead) {
        res.end();
        return;
    }
    if (response.body) {
        const arrayBuffer = await response.arrayBuffer();
        const body = Buffer.from(arrayBuffer);
        res.send(body);
    }
    else {
        res.end();
    }
}
function applyRuntimeTraceHeaders(res, segmentConfig, mode) {
    res.setHeader('X-Vista-Route-Runtime', segmentConfig.runtime);
    res.setHeader('X-Vista-Advanced-Runtime', mode);
}
function createReadonlyCookieStore(header) {
    const cookieMap = new Map();
    if (header) {
        for (const segment of header.split(';')) {
            const [rawName, ...valueParts] = segment.split('=');
            const name = rawName?.trim();
            if (!name)
                continue;
            cookieMap.set(name, decodeURIComponent(valueParts.join('=').trim()));
        }
    }
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
    };
}
async function readRouteRequestBody(req) {
    if (req.method === 'GET' || req.method === 'HEAD') {
        return undefined;
    }
    if (Buffer.isBuffer(req.rawBody)) {
        return req.rawBody;
    }
    if (Buffer.isBuffer(req.body)) {
        return req.body;
    }
    if (typeof req.body === 'string') {
        return Buffer.from(req.body, 'utf-8');
    }
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        return Buffer.from(JSON.stringify(req.body), 'utf-8');
    }
    try {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (chunks.length > 0) {
            return Buffer.concat(chunks);
        }
    }
    catch {
        // Stream may already be closed or ended
    }
    return undefined;
}
function buildRequestUrl(req) {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    return new URL(req.originalUrl || req.url || req.path || '/', `${protocol}://${host}`);
}
function createRouteRequest(req, body) {
    const requestUrl = buildRequestUrl(req);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers || {})) {
        if (Array.isArray(value)) {
            for (const entry of value) {
                headers.append(key, String(entry));
            }
            continue;
        }
        if (value !== undefined) {
            headers.set(key, String(value));
        }
    }
    const requestInit = {
        method: req.method,
        headers,
    };
    if (body !== undefined) {
        requestInit.body = new Uint8Array(body);
    }
    const request = new Request(requestUrl.toString(), requestInit);
    Object.defineProperty(request, 'nextUrl', {
        configurable: true,
        enumerable: true,
        value: {
            pathname: requestUrl.pathname,
            searchParams: requestUrl.searchParams,
            href: requestUrl.href,
            origin: requestUrl.origin,
        },
    });
    Object.defineProperty(request, 'cookies', {
        configurable: true,
        enumerable: true,
        value: createReadonlyCookieStore(headers.get('cookie')),
    });
    return request;
}
function resolveRouteSegmentRuntime(apiPath, apiModule) {
    let parsedSourceConfig = {};
    try {
        const source = fs_1.default.readFileSync(apiPath, 'utf-8');
        parsedSourceConfig = (0, segment_config_1.parseSegmentConfig)(source, apiPath).config;
    }
    catch {
        parsedSourceConfig = {};
    }
    const runtimeValue = typeof apiModule?.runtime === 'string' ? apiModule.runtime : parsedSourceConfig.runtime;
    return (0, segment_config_1.mergeSegmentConfigs)([
        {
            absolutePath: apiPath,
            segmentConfig: {
                ...parsedSourceConfig,
                ...(runtimeValue ? { runtime: runtimeValue } : {}),
            },
        },
    ]);
}
function isEdgeRuntime(runtime) {
    return runtime === 'edge' || runtime === 'experimental-edge';
}
function getTypedApiEntrypoint(cwd) {
    for (const relativePath of TYPED_API_ENTRYPOINTS) {
        const absolutePath = path_1.default.resolve(cwd, relativePath);
        if (fs_1.default.existsSync(absolutePath)) {
            return absolutePath;
        }
    }
    return null;
}
async function executeTypedRoute(router, options) {
    const pathCandidates = buildPathCandidates(options.req.path);
    const method = options.method.toLowerCase();
    let selectedPath = null;
    let routeExistsForDifferentMethod = false;
    for (const candidate of pathCandidates) {
        if (hasMethodMatch(router, candidate, method)) {
            selectedPath = candidate;
            break;
        }
        if (hasRouteForAnyMethod(router, candidate)) {
            routeExistsForDifferentMethod = true;
        }
    }
    if (!selectedPath) {
        if (routeExistsForDifferentMethod) {
            return {
                kind: 'method-not-allowed',
                status: 405,
                error: `Method ${method.toUpperCase()} not allowed`,
            };
        }
        return { kind: 'not-found' };
    }
    const result = await (0, server_1.executeRoute)(router, {
        path: selectedPath,
        method,
        req: {
            method,
            path: selectedPath,
            query: options.query,
            body: options.body,
            headers: options.req.headers,
            originalUrl: options.req.originalUrl,
            url: options.req.url,
        },
        ctx: options.context,
        env: options.env,
        serialization: options.serialization,
    });
    return {
        kind: 'handled',
        status: 200,
        payload: result.serializedData,
    };
}
function getAppDirectories(cwd) {
    const dirs = [];
    const appDir = path_1.default.resolve(cwd, 'app');
    if (fs_1.default.existsSync(appDir)) {
        try {
            if (fs_1.default.statSync(appDir).isDirectory()) {
                dirs.push(appDir);
            }
        }
        catch { }
    }
    const srcAppDir = path_1.default.resolve(cwd, 'src', 'app');
    if (fs_1.default.existsSync(srcAppDir)) {
        try {
            if (fs_1.default.statSync(srcAppDir).isDirectory()) {
                dirs.push(srcAppDir);
            }
        }
        catch { }
    }
    return dirs;
}
function parseRouteSegment(segment) {
    if (segment.startsWith('[[...') && segment.endsWith(']]')) {
        return {
            raw: segment,
            isDynamic: true,
            isCatchAll: true,
            isOptionalCatchAll: true,
            paramName: segment.slice(5, -2),
            score: 10,
        };
    }
    if (segment.startsWith('[...') && segment.endsWith(']')) {
        return {
            raw: segment,
            isDynamic: true,
            isCatchAll: true,
            isOptionalCatchAll: false,
            paramName: segment.slice(4, -1),
            score: 20,
        };
    }
    if (segment.startsWith('[') && segment.endsWith(']')) {
        return {
            raw: segment,
            isDynamic: true,
            isCatchAll: false,
            isOptionalCatchAll: false,
            paramName: segment.slice(1, -1),
            score: 50,
        };
    }
    return {
        raw: segment,
        isDynamic: false,
        isCatchAll: false,
        isOptionalCatchAll: false,
        paramName: '',
        score: 100,
    };
}
function discoverRouteHandlers(appDir) {
    const handlers = [];
    function walk(currentDir, relParts) {
        if (!fs_1.default.existsSync(currentDir))
            return;
        let entries = [];
        try {
            entries = fs_1.default.readdirSync(currentDir, { withFileTypes: true });
        }
        catch {
            return;
        }
        // 1. Check for route.(ts|tsx|js|jsx) in currentDir
        for (const ext of ROUTE_FILE_EXTENSIONS) {
            const routePath = path_1.default.join(currentDir, `route${ext}`);
            if (fs_1.default.existsSync(routePath)) {
                const urlSegments = relParts.filter((seg) => !isRouteGroupDirectory(seg));
                const segments = urlSegments.map(parseRouteSegment);
                const score = segments.reduce((sum, s) => sum + s.score, 0);
                handlers.push({
                    filePath: routePath,
                    segments,
                    score,
                });
                break;
            }
        }
        // 2. Backwards compatibility for app/api direct files like app/api/ping.ts
        const isUnderApi = relParts[0] === 'api';
        if (isUnderApi) {
            for (const entry of entries) {
                if (!entry.isDirectory()) {
                    const ext = path_1.default.extname(entry.name);
                    if (ROUTE_FILE_EXTENSIONS.includes(ext)) {
                        const stem = path_1.default.basename(entry.name, ext);
                        if (stem !== 'route' && stem !== 'typed' && stem !== 'typed-api') {
                            const urlSegments = [...relParts, stem].filter((seg) => !isRouteGroupDirectory(seg));
                            const segments = urlSegments.map(parseRouteSegment);
                            const score = segments.reduce((sum, s) => sum + s.score, 0);
                            handlers.push({
                                filePath: path_1.default.join(currentDir, entry.name),
                                segments,
                                score,
                                isDirectFile: true,
                            });
                        }
                    }
                }
            }
        }
        // 3. Recurse into subdirectories
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.'))
                    continue;
                walk(path_1.default.join(currentDir, entry.name), [...relParts, entry.name]);
            }
        }
    }
    walk(appDir, []);
    return handlers;
}
function compareRouteSpecificity(a, b) {
    const maxLen = Math.max(a.segments.length, b.segments.length);
    for (let i = 0; i < maxLen; i++) {
        const segA = a.segments[i];
        const segB = b.segments[i];
        if (!segA && segB) {
            return segB.isOptionalCatchAll ? -1 : 1;
        }
        if (segA && !segB) {
            return segA.isOptionalCatchAll ? 1 : -1;
        }
        if (segA && segB) {
            if (segA.score !== segB.score) {
                return segB.score - segA.score;
            }
        }
    }
    if (a.score !== b.score) {
        return b.score - a.score;
    }
    if (Boolean(a.isDirectFile) !== Boolean(b.isDirectFile)) {
        return a.isDirectFile ? 1 : -1;
    }
    return a.filePath.localeCompare(b.filePath);
}
function matchRouteHandler(handler, reqSegments) {
    const routeSegments = handler.segments;
    const lastSeg = routeSegments.length > 0 ? routeSegments[routeSegments.length - 1] : null;
    const hasCatchAll = lastSeg?.isCatchAll || lastSeg?.isOptionalCatchAll;
    if (!hasCatchAll) {
        if (routeSegments.length !== reqSegments.length) {
            return null;
        }
        const params = {};
        for (let i = 0; i < routeSegments.length; i++) {
            const routeSeg = routeSegments[i];
            const reqVal = reqSegments[i];
            if (routeSeg.isDynamic) {
                params[routeSeg.paramName] = decodeURIComponent(reqVal);
            }
            else if (routeSeg.raw !== reqVal) {
                return null;
            }
        }
        return params;
    }
    const prefixLen = routeSegments.length - 1;
    if (lastSeg.isOptionalCatchAll) {
        if (reqSegments.length < prefixLen) {
            return null;
        }
    }
    else {
        if (reqSegments.length < prefixLen + 1) {
            return null;
        }
    }
    const params = {};
    for (let i = 0; i < prefixLen; i++) {
        const routeSeg = routeSegments[i];
        const reqVal = reqSegments[i];
        if (routeSeg.isDynamic) {
            params[routeSeg.paramName] = decodeURIComponent(reqVal);
        }
        else if (routeSeg.raw !== reqVal) {
            return null;
        }
    }
    if (reqSegments.length > prefixLen) {
        params[lastSeg.paramName] = reqSegments.slice(prefixLen).map(decodeURIComponent);
    }
    else if (lastSeg.isOptionalCatchAll) {
        params[lastSeg.paramName] = undefined;
    }
    return params;
}
function resolveRouteHandler(cwd, requestPath) {
    const rawPath = String(requestPath || '').split('?')[0];
    const metadataRoute = METADATA_ROUTE_MAPPINGS.find((entry) => entry.requestPath === rawPath);
    if (metadataRoute) {
        for (const appDir of getAppDirectories(cwd)) {
            const resolvedMetadataPath = resolveMetadataRoutePath(appDir, metadataRoute.stem);
            if (resolvedMetadataPath) {
                return {
                    filePath: resolvedMetadataPath,
                    params: {},
                };
            }
        }
    }
    const normalized = normalizeRouteRequestPath(requestPath);
    const reqSegments = normalized ? normalized.split('/').filter(Boolean) : [];
    for (const appDir of getAppDirectories(cwd)) {
        const discovered = discoverRouteHandlers(appDir);
        discovered.sort(compareRouteSpecificity);
        for (const handler of discovered) {
            const params = matchRouteHandler(handler, reqSegments);
            if (params !== null) {
                return {
                    filePath: handler.filePath,
                    params,
                };
            }
        }
    }
    return null;
}
function resolveLegacyApiRoutePath(cwd, requestPath) {
    if (!requestPath.startsWith('/api/') && requestPath !== '/api') {
        return null;
    }
    return resolveLegacyRouteHandlerPath(cwd, requestPath);
}
function resolveLegacyRouteHandlerPath(cwd, requestPath) {
    const resolved = resolveRouteHandler(cwd, requestPath);
    return resolved ? resolved.filePath : null;
}
function createParamsContext(rawParams) {
    const promise = Promise.resolve(rawParams);
    for (const [key, value] of Object.entries(rawParams)) {
        Object.defineProperty(promise, key, {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    }
    return promise;
}
async function runRouteHandler(options) {
    const { req, res, apiPath, isDev, params = {} } = options;
    if (isDev) {
        delete require.cache[require.resolve(apiPath)];
    }
    const rawModule = require(apiPath);
    const apiModule = rawModule && typeof rawModule === 'object' && rawModule.__esModule && rawModule.default && typeof rawModule.default === 'object'
        ? { ...rawModule.default, ...rawModule }
        : rawModule;
    const resolvedSegmentConfig = resolveRouteSegmentRuntime(apiPath, apiModule);
    (0, request_context_1.setCurrentSegmentConfig)(resolvedSegmentConfig);
    const runtime = resolvedSegmentConfig.runtime;
    applyRuntimeTraceHeaders(res, resolvedSegmentConfig, 'route-handler');
    const rawMethod = (req.method || 'GET').toUpperCase();
    const getHandler = (methodName) => {
        if (typeof apiModule?.[methodName] === 'function')
            return apiModule[methodName];
        if (typeof rawModule?.[methodName] === 'function')
            return rawModule[methodName];
        if (typeof apiModule?.default?.[methodName] === 'function')
            return apiModule.default[methodName];
        return null;
    };
    const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    const exportedMethods = new Set();
    for (const m of HTTP_METHODS) {
        if (getHandler(m)) {
            exportedMethods.add(m);
        }
    }
    const allowedMethods = new Set(exportedMethods);
    if (allowedMethods.has('GET')) {
        allowedMethods.add('HEAD');
    }
    if (allowedMethods.size > 0) {
        allowedMethods.add('OPTIONS');
    }
    // 1. OPTIONS auto-handling
    if (rawMethod === 'OPTIONS') {
        const customOptionsHandler = getHandler('OPTIONS');
        if (customOptionsHandler) {
            const requestBody = await readRouteRequestBody(req);
            const request = createRouteRequest(req, requestBody);
            const paramsContext = createParamsContext(params);
            const result = await customOptionsHandler(request, { params: paramsContext });
            if (result instanceof Response) {
                await sendFetchResponse(res, result);
                return;
            }
            if (result !== undefined) {
                res.status(200).json(result);
                return;
            }
            res.status(204).end();
            return;
        }
        if (allowedMethods.size > 0) {
            res.setHeader('Allow', Array.from(allowedMethods).join(', '));
            res.status(204).end();
            return;
        }
    }
    // 2. HEAD auto-fallback to GET
    if (rawMethod === 'HEAD') {
        const headHandler = getHandler('HEAD');
        if (headHandler) {
            const requestBody = await readRouteRequestBody(req);
            const request = createRouteRequest(req, requestBody);
            const paramsContext = createParamsContext(params);
            const result = await headHandler(request, { params: paramsContext });
            if (result instanceof Response) {
                await sendFetchResponse(res, result, { isHead: true });
                return;
            }
            res.status(204).end();
            return;
        }
        const getHandlerFn = getHandler('GET');
        if (getHandlerFn) {
            const request = createRouteRequest(req, undefined);
            const paramsContext = createParamsContext(params);
            const result = await getHandlerFn(request, { params: paramsContext });
            if (result instanceof Response) {
                await sendFetchResponse(res, result, { isHead: true });
                return;
            }
            res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8').end();
            return;
        }
    }
    // 3. Directly exported HTTP method
    const methodHandler = getHandler(rawMethod);
    if (typeof methodHandler === 'function') {
        const requestBody = await readRouteRequestBody(req);
        const request = createRouteRequest(req, requestBody);
        const paramsContext = createParamsContext(params);
        const result = await methodHandler(request, { params: paramsContext });
        if (result instanceof Response) {
            await sendFetchResponse(res, result);
            return;
        }
        if (result !== undefined) {
            res.status(200).json(result);
            return;
        }
        res.status(204).end();
        return;
    }
    // 4. Method not allowed if other HTTP methods are exported
    if (allowedMethods.size > 0) {
        res.setHeader('Allow', Array.from(allowedMethods).join(', '));
        res.status(405).json({ error: `Method ${rawMethod} Not Allowed` });
        return;
    }
    // 5. Legacy default Express export (req, res)
    if (isEdgeRuntime(runtime) && typeof apiModule.default === 'function') {
        res.status(500).json({
            error: 'Edge runtime route handlers must export HTTP method functions instead of a default Express handler.',
        });
        return;
    }
    if (typeof apiModule.default === 'function') {
        apiModule.default(req, res);
        return;
    }
    res.status(405).json({ error: `Method ${rawMethod} Not Allowed` });
}
async function runLegacyApiRoute(options) {
    return runRouteHandler(options);
}
async function runTypedApiRoute(options) {
    const { req, res, cwd, isDev, config } = options;
    if (!config.enabled) {
        return false;
    }
    const entrypoint = getTypedApiEntrypoint(cwd);
    if (!entrypoint) {
        return false;
    }
    try {
        if (isDev) {
            delete require.cache[require.resolve(entrypoint)];
        }
        const typedModule = require(entrypoint);
        const router = resolveTypedRouterFromModule(typedModule);
        const resolvedSegmentConfig = resolveRouteSegmentRuntime(entrypoint, typedModule);
        (0, request_context_1.setCurrentSegmentConfig)(resolvedSegmentConfig);
        applyRuntimeTraceHeaders(res, resolvedSegmentConfig, 'typed-api');
        if (!router) {
            res.status(500).json({
                error: `Typed API entrypoint "${path_1.default.relative(cwd, entrypoint)}" does not export a valid stack router.`,
            });
            return true;
        }
        const method = (req.method || 'GET').toUpperCase();
        const body = await parseRequestBody(req, config.bodySizeLimitBytes);
        const query = (req.query ?? {});
        const contextFactory = typeof typedModule.createContext === 'function' ? typedModule.createContext : null;
        const envFactory = typeof typedModule.createEnv === 'function' ? typedModule.createEnv : null;
        const context = contextFactory ? await contextFactory({ req, res }) : {};
        const env = envFactory ? await envFactory({ req, res }) : {};
        const routeResult = await executeTypedRoute(router, {
            req,
            method,
            query,
            body,
            serialization: config.serialization,
            context: context ?? {},
            env,
        });
        if (routeResult.kind === 'not-found') {
            return false;
        }
        if (routeResult.kind === 'method-not-allowed') {
            res.status(routeResult.status).json({ error: routeResult.error });
            return true;
        }
        res.status(routeResult.status).json(routeResult.payload);
        return true;
    }
    catch (error) {
        const typedError = error;
        if (typedError instanceof BodyLimitError || typedError instanceof BodyParseError) {
            res.status(typedError.status).json({ error: typedError.message });
            return true;
        }
        if (typedError instanceof server_1.StackValidationError ||
            typedError instanceof server_1.StackMethodNotAllowedError) {
            const status = typeof typedError.status === 'number' ? typedError.status : 400;
            res.status(status).json({ error: typedError.message });
            return true;
        }
        if (typedError instanceof server_1.StackRouteNotFoundError) {
            return false;
        }
        // Router-level error handler gets first chance.
        try {
            const entrypoint = getTypedApiEntrypoint(cwd);
            if (entrypoint) {
                if (isDev) {
                    delete require.cache[require.resolve(entrypoint)];
                }
                const typedModule = require(entrypoint);
                const router = resolveTypedRouterFromModule(typedModule);
                const errorHandler = router?.metadata?.errorHandler;
                if (typeof errorHandler === 'function') {
                    const response = errorHandler(error, {
                        method: req.method,
                        path: req.path,
                        query: (req.query ?? {}),
                        headers: req.headers,
                    });
                    if (response instanceof Response) {
                        await sendFetchResponse(res, response);
                        return true;
                    }
                }
            }
        }
        catch {
            // Ignore fallback handler errors and use generic 500 response below.
        }
        res.status(500).json({ error: 'Internal Server Error in Typed API' });
        return true;
    }
}
