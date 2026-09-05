"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLegacyApiRoutePath = resolveLegacyApiRoutePath;
exports.resolveRouteHandlerMatch = resolveRouteHandlerMatch;
exports.resolveLegacyRouteHandlerPath = resolveLegacyRouteHandlerPath;
exports.runLegacyApiRoute = runLegacyApiRoute;
exports.runTypedApiRoute = runTypedApiRoute;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const server_1 = require("../stack/server");
const segment_config_1 = require("./segment-config");
const request_context_1 = require("./request-context");
const route_handler_registry_1 = require("./route-handler-registry");
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
function resolveMetadataRoutePath(cwd, stem) {
    const appDir = path_1.default.resolve(cwd, 'app');
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
async function sendFetchResponse(res, response) {
    response.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });
    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    res.status(response.status).send(body);
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
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) {
        return undefined;
    }
    return Buffer.concat(chunks);
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
function resolveLegacyApiRoutePath(cwd, requestPath) {
    if (!requestPath.startsWith('/api/')) {
        return null;
    }
    return resolveLegacyRouteHandlerPath(cwd, requestPath);
}
/**
 * Resolve a request path to a route handler file plus its dynamic params.
 *
 * Static routes are answered by a direct filesystem probe, which keeps the common
 * case free of any directory walk. Only when that misses do we consult the discovered
 * route table, which is what makes `app/api/users/[id]/route.ts` reachable.
 */
function resolveRouteHandlerMatch(cwd, requestPath, options = {}) {
    const literalPath = resolveLegacyRouteHandlerPath(cwd, requestPath);
    if (literalPath) {
        return { filePath: literalPath, params: {} };
    }
    const dynamicMatch = (0, route_handler_registry_1.resolveRouteHandler)(path_1.default.resolve(cwd, 'app'), requestPath, options);
    if (dynamicMatch) {
        return { filePath: dynamicMatch.filePath, params: dynamicMatch.params };
    }
    return null;
}
function resolveLegacyRouteHandlerPath(cwd, requestPath) {
    const normalized = normalizeRouteRequestPath(requestPath);
    const routeCandidates = [];
    const metadataRoute = METADATA_ROUTE_MAPPINGS.find((entry) => entry.requestPath === String(requestPath || '').split('?')[0]);
    if (metadataRoute) {
        const resolvedMetadataPath = resolveMetadataRoutePath(cwd, metadataRoute.stem);
        if (resolvedMetadataPath) {
            routeCandidates.push(resolvedMetadataPath);
        }
    }
    if (normalized.startsWith('api/')) {
        const apiRoute = normalized.slice('api/'.length);
        routeCandidates.push(path_1.default.resolve(cwd, 'app', 'api', apiRoute, 'route.ts'), path_1.default.resolve(cwd, 'app', 'api', apiRoute, 'route.tsx'), path_1.default.resolve(cwd, 'app', 'api', apiRoute, 'route.js'), path_1.default.resolve(cwd, 'app', 'api', apiRoute, 'route.jsx'), path_1.default.resolve(cwd, 'app', 'api', `${apiRoute}.ts`), path_1.default.resolve(cwd, 'app', 'api', `${apiRoute}.tsx`), path_1.default.resolve(cwd, 'app', 'api', `${apiRoute}.js`), path_1.default.resolve(cwd, 'app', 'api', `${apiRoute}.jsx`));
    }
    routeCandidates.push(path_1.default.resolve(cwd, 'app', normalized, 'route.ts'), path_1.default.resolve(cwd, 'app', normalized, 'route.tsx'), path_1.default.resolve(cwd, 'app', normalized, 'route.js'), path_1.default.resolve(cwd, 'app', normalized, 'route.jsx'));
    for (const routePath of routeCandidates) {
        if (fs_1.default.existsSync(routePath)) {
            return routePath;
        }
    }
    return null;
}
/** HTTP methods a module actually exports, in canonical order. */
function getExportedRouteMethods(apiModule) {
    return route_handler_registry_1.ROUTE_HANDLER_METHODS.filter((method) => typeof apiModule?.[method] === 'function');
}
async function runLegacyApiRoute(options) {
    const { req, res, apiPath, isDev } = options;
    const params = options.params || {};
    if (isDev) {
        delete require.cache[require.resolve(apiPath)];
    }
    const apiModule = require(apiPath);
    const resolvedSegmentConfig = resolveRouteSegmentRuntime(apiPath, apiModule);
    (0, request_context_1.setCurrentSegmentConfig)(resolvedSegmentConfig);
    const runtime = resolvedSegmentConfig.runtime;
    applyRuntimeTraceHeaders(res, resolvedSegmentConfig, 'route-handler');
    const method = req.method?.toUpperCase() || 'GET';
    const exportedMethods = getExportedRouteMethods(apiModule);
    // HEAD falls back to GET, per RFC 9110: same headers, response body dropped by
    // Express because the request method is HEAD.
    const methodHandler = apiModule[method] || (method === 'HEAD' ? apiModule.GET : undefined);
    // An unhandled OPTIONS request is answered from the exported method list rather
    // than 405, so CORS preflight works without every route writing a handler.
    if (method === 'OPTIONS' && typeof methodHandler !== 'function' && exportedMethods.length > 0) {
        const allow = [...new Set([...exportedMethods, 'OPTIONS'])].join(', ');
        res.status(204).setHeader('Allow', allow);
        res.end();
        return;
    }
    if (typeof methodHandler === 'function') {
        const requestBody = await readRouteRequestBody(req);
        const request = createRouteRequest(req, requestBody);
        const result = await methodHandler(request, { params });
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
    if (exportedMethods.length > 0) {
        res.setHeader('Allow', [...new Set([...exportedMethods, 'OPTIONS'])].join(', '));
    }
    res.status(405).json({ error: `Method ${method} not allowed` });
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
