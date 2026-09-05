"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enableClientComponentWrapping = enableClientComponentWrapping;
exports.disableClientComponentWrapping = disableClientComponentWrapping;
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const server_1 = require("react-dom/server");
const react_1 = __importDefault(require("react"));
const stream_1 = require("stream");
const webpack_dev_middleware_1 = __importDefault(require("webpack-dev-middleware"));
const webpack_hot_middleware_1 = __importDefault(require("webpack-hot-middleware"));
const constants_1 = require("../constants");
const config_1 = require("../config");
const dev_error_1 = require("../dev-error");
const artifact_validator_1 = require("./artifact-validator");
const root_resolver_1 = require("./root-resolver");
const structure_watch_1 = require("./structure-watch");
const middleware_runner_1 = require("./middleware-runner");
const image_optimizer_1 = require("./image-optimizer");
const static_cache_1 = require("./static-cache");
const ppr_1 = require("./ppr");
const registry_1 = require("../font/registry");
const not_found_page_1 = require("./not-found-page");
const typed_api_runtime_1 = require("./typed-api-runtime");
const logger_1 = require("./logger");
const structure_log_1 = require("./structure-log");
const module_compile_hook_1 = require("./module-compile-hook");
const request_context_1 = require("./request-context");
// Support CSS imports on server runtime
// - Regular .css: ignored (handled by PostCSS)
// - .module.css: return empty class mapping (webpack build handles real mappings)
require.extensions['.css'] = (m, filename) => {
    if (filename.endsWith('.module.css')) {
        m.exports = {};
    }
};
// Use SWC for faster server-side TypeScript compilation
try {
    // Try to resolve from project's node_modules first (where apps install their deps)
    const swcRegisterPath = require.resolve('@swc-node/register/register', {
        paths: [process.cwd(), path_1.default.resolve(process.cwd(), '..'), path_1.default.resolve(process.cwd(), '..', '..')],
    });
    const typescriptPath = require.resolve('typescript', {
        paths: [process.cwd(), path_1.default.resolve(process.cwd(), '..'), path_1.default.resolve(process.cwd(), '..', '..')],
    });
    const { register } = require(swcRegisterPath);
    const ts = require(typescriptPath);
    register({
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        moduleResolution: ts.ModuleResolutionKind.Node16,
        esModuleInterop: true,
        allowJs: true,
    });
}
catch (e) {
    // Fallback to ts-node if @swc-node not available
    try {
        const tsNodePath = require.resolve('ts-node', {
            paths: [process.cwd(), path_1.default.resolve(process.cwd(), '..'), path_1.default.resolve(process.cwd(), '..', '..')],
        });
        require(tsNodePath).register({
            transpileOnly: true,
            compilerOptions: {
                module: 'commonjs',
                jsx: 'react-jsx',
                moduleResolution: 'node16',
                esModuleInterop: true,
                allowJs: true,
            },
        });
    }
    catch (e2) {
        // No TypeScript compiler found
    }
}
(0, module_compile_hook_1.installModuleCompileHook)({ cwd: process.cwd() });
// ============================================================================
// RSC: Auto-wrap client components with hydration markers
// ============================================================================
const client_boundary_1 = require("./client-boundary");
// Cache absolute client file path -> stable component ID
const clientComponentIdsByPath = new Map();
// Initialize client component registry from scan
function normalizeModulePath(filePath) {
    return filePath.replace(/\\/g, '/').toLowerCase();
}
function toComponentId(relativePath) {
    return relativePath.replace(/\\/g, '/').replace(/\.(tsx|ts|jsx|js)$/, '');
}
function registerClientComponents(scanDir, prefix = '') {
    if (!fs_1.default.existsSync(scanDir))
        return 0;
    const { scanAppDirectory } = require('../bin/file-scanner');
    const result = scanAppDirectory(scanDir);
    result.clientComponents.forEach((component) => {
        const normalizedAbsolute = normalizeModulePath(component.absolutePath);
        const prefixedPath = prefix ? `${prefix}${component.relativePath}` : component.relativePath;
        clientComponentIdsByPath.set(normalizedAbsolute, toComponentId(prefixedPath));
    });
    return result.clientComponents.length;
}
function initClientComponentRegistry(appDir, cwd) {
    try {
        clientComponentIdsByPath.clear();
        const appCount = registerClientComponents(appDir);
        const componentsCount = registerClientComponents(path_1.default.join(cwd, 'components'), 'components/');
        if (process.env.VISTA_DEBUG) {
            console.log(`[Vista JS RSC] Registered ${clientComponentIdsByPath.size} client component(s) for hydration wrapping (app=${appCount}, components=${componentsCount})`);
        }
    }
    catch (e) {
        // Fallback - scanning not available
    }
}
function getClientComponentId(filePath) {
    const normalized = normalizeModulePath(filePath);
    return clientComponentIdsByPath.get(normalized) ?? null;
}
// Store original require for tsx/ts files
const Module = require('module');
const originalLoad = Module._load;
// CRITICAL: Ensure single React instance across all requires
// This fixes "Invalid hook call" errors during SSR with monorepo/linked packages
const reactPath = require.resolve('react');
const reactDomPath = require.resolve('react-dom');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
    // Redirect all react/react-dom requires to our single instance
    if (request === 'react') {
        return reactPath;
    }
    if (request === 'react-dom') {
        return reactDomPath;
    }
    if (request.startsWith('react-dom/')) {
        // Handle subpaths like react-dom/server, react-dom/client
        const subpath = request.replace('react-dom/', '');
        try {
            return require.resolve(`react-dom/${subpath}`, { paths: [path_1.default.dirname(reactDomPath)] });
        }
        catch {
            return originalResolveFilename.call(this, request, parent, isMain, options);
        }
    }
    if (request.startsWith('react/')) {
        // Handle subpaths like react/jsx-runtime
        const subpath = request.replace('react/', '');
        try {
            return require.resolve(`react/${subpath}`, { paths: [path_1.default.dirname(reactPath)] });
        }
        catch {
            return originalResolveFilename.call(this, request, parent, isMain, options);
        }
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
};
// Global flag to control wrapping
let wrapClientComponents = false;
function enableClientComponentWrapping(appDir, cwd) {
    initClientComponentRegistry(appDir, cwd);
    // Clear require cache for client component files so they can be wrapped
    for (const clientPath of clientComponentIdsByPath.keys()) {
        // Find and clear all cached versions of this module
        for (const cachedPath of Object.keys(require.cache)) {
            const normalizedCached = normalizeModulePath(cachedPath);
            if (normalizedCached === clientPath) {
                delete require.cache[cachedPath];
            }
        }
    }
    wrapClientComponents = true;
    // Override Module._load to wrap client components
    Module._load = function (request, parent, isMain) {
        const result = originalLoad.apply(this, arguments);
        // Only process if wrapping is enabled and we have a parent with filename
        if (wrapClientComponents && parent?.filename) {
            try {
                const resolved = Module._resolveFilename(request, parent, isMain);
                // Check if this is a client component
                const componentId = getClientComponentId(resolved);
                if (componentId && result?.default) {
                    // Wrap the default export if not already wrapped
                    if (!result.default[constants_1.WRAPPED_MARKER]) {
                        const OriginalComponent = result.default;
                        const WrappedComponent = (0, client_boundary_1.wrapClientComponent)(OriginalComponent, componentId);
                        WrappedComponent[constants_1.WRAPPED_MARKER] = true;
                        result.default = WrappedComponent;
                    }
                }
            }
            catch (e) {
                // Ignore resolution errors
            }
        }
        return result;
    };
}
function disableClientComponentWrapping() {
    wrapClientComponents = false;
}
// ============================================================================
function startServer(port = 3003, compiler) {
    const app = (0, express_1.default)();
    const cwd = process.cwd();
    const vistaConfig = (0, config_1.loadConfig)(cwd);
    const cacheComponentsConfig = (0, config_1.resolveCacheComponentsConfig)(vistaConfig);
    const engineVariant = (0, config_1.resolveAndApplyEngineVariant)(vistaConfig);
    const typedApiConfig = (0, config_1.resolveTypedApiConfig)(vistaConfig);
    const isDev = process.env.NODE_ENV !== 'production';
    const appDir = path_1.default.join(cwd, 'app');
    if (process.env.VISTA_DEBUG) {
        (0, logger_1.logInfo)(`Engine variant: ${engineVariant}`);
    }
    (0, module_compile_hook_1.installModuleCompileHook)({
        cwd,
        cacheComponentsEnabled: cacheComponentsConfig.enabled,
    });
    // Allow port override from config
    const finalPort = vistaConfig.server?.port || port;
    // Request logger — logs GET/POST with timing (skip internal webpack requests)
    app.use((0, logger_1.requestLogger)());
    // In dev mode, webpack-dev-middleware serves client.js from memory — skip artifact check
    if (!isDev) {
        try {
            (0, artifact_validator_1.assertVistaArtifacts)(cwd, 'legacy');
        }
        catch (error) {
            const message = error.message;
            console.error(message);
            process.exit(1);
        }
    }
    // ========================================================================
    // Structure Validation (dev + strict-block)
    // ========================================================================
    const structureConfig = (0, config_1.resolveStructureValidationConfig)(vistaConfig);
    let currentStructureState = null;
    let structureWatcher = null;
    if (structureConfig.enabled) {
        const { validateAppStructure } = require('./structure-validator');
        const initialResult = validateAppStructure({ cwd });
        currentStructureState = initialResult;
        (0, structure_log_1.logValidationResult)(initialResult, structureConfig.logLevel);
        if (initialResult.state === 'error' && structureConfig.mode === 'strict') {
            (0, structure_log_1.logDevBlocked)();
        }
    }
    // Enable RSC: Auto-wrap client components with hydration markers
    enableClientComponentWrapping(appDir, cwd);
    // Load pre-rendered static pages from disk into in-memory cache
    const vistaDirRoot = path_1.default.join(cwd, constants_1.BUILD_DIR);
    const loadedStaticPages = (0, static_cache_1.loadStaticPagesFromDisk)(vistaDirRoot);
    if (loadedStaticPages > 0) {
        (0, logger_1.logInfo)(`Loaded ${loadedStaticPages} pre-rendered page(s) from cache`);
    }
    // Webpack Dev + Hot Middleware (only in dev mode with compiler)
    if (isDev && compiler) {
        if (process.env.VISTA_DEBUG)
            (0, logger_1.logInfo)('Webpack HMR enabled');
        app.use((0, webpack_dev_middleware_1.default)(compiler, {
            publicPath: '/',
            stats: 'errors-warnings',
            writeToDisk: (filePath) => {
                // Write CSS to disk (served statically)
                return filePath.endsWith('.css');
            },
        }));
        app.use((0, webpack_hot_middleware_1.default)(compiler, {
            log: false, // Reduce console noise
            path: '/__webpack_hmr',
            heartbeat: 2000,
        }));
        // Server-Side Live Reload via SSE
        // Watches server component files and triggers page reload
        const sseClients = new Set();
        // SSE endpoint for server reload
        app.get(constants_1.SSE_ENDPOINT, (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
            sseClients.add(res);
            // Send initial connection message
            res.write('data: connected\n\n');
            req.on('close', () => {
                sseClients.delete(res);
            });
        });
        // Watch server files and trigger reload
        let debounceTimer = null;
        const triggerReload = () => {
            if (debounceTimer)
                clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                (0, logger_1.logEvent)('Server file changed, reloading...');
                sseClients.forEach((client) => {
                    client.write('data: reload\n\n');
                });
            }, 60);
        };
        // Push compile errors to browser via SSE
        const pushCompileError = (errorMessages) => {
            const normalized = (Array.isArray(errorMessages) ? errorMessages : [])
                .map((entry) => String(entry || '').trim())
                .filter(Boolean);
            const fallback = normalized.length > 0 ? normalized.join('\n\n') : 'Unknown build error.';
            const errorData = JSON.stringify({
                type: 'error',
                message: fallback,
                errors: normalized.length > 0 ? normalized : [fallback],
            });
            sseClients.forEach((client) => {
                client.write(`data: ${errorData}\n\n`);
            });
        };
        // Push build success to browser
        const pushBuildSuccess = () => {
            const data = JSON.stringify({ type: 'ok' });
            sseClients.forEach((client) => {
                client.write(`data: ${data}\n\n`);
            });
        };
        // Listen to webpack compilation errors
        compiler.hooks.done.tap('VistaSSE', (stats) => {
            if (stats.hasErrors()) {
                const errors = stats.toJson().errors || [];
                const errorMessages = errors
                    .map((e) => {
                    if (typeof e === 'string')
                        return e;
                    if (e && typeof e.message === 'string')
                        return e.message;
                    return String(e || '');
                })
                    .filter((entry) => entry.trim().length > 0);
                (0, logger_1.logEvent)('Build error detected, pushing to browser...');
                pushCompileError(errorMessages);
            }
            else {
                pushBuildSuccess();
            }
        });
        // Watch the app directory for server file changes
        fs_1.default.watch(appDir, { recursive: true }, (event, filename) => {
            if (filename && (filename.endsWith('.tsx') || filename.endsWith('.ts'))) {
                // Check if it's a server component (not client)
                const filePath = path_1.default.join(appDir, filename);
                try {
                    const content = fs_1.default.readFileSync(filePath, 'utf-8');
                    // Server files don't have 'use client' directive
                    if (!content.includes("'use client'") && !content.includes('"use client"')) {
                        triggerReload();
                    }
                }
                catch (e) {
                    // File might be deleted or being written
                }
            }
        });
        // ====================================================================
        // Structure Validation Watcher (dev mode)
        // ====================================================================
        if (structureConfig.enabled) {
            structureWatcher = new structure_watch_1.StructureWatcher({
                cwd,
                debounceMs: structureConfig.watchDebounceMs,
            });
            structureWatcher.on('validation', (event) => {
                (0, structure_log_1.logValidationResult)({ state: event.state, issues: event.issues, routeGraph: [], timestamp: event.timestamp }, structureConfig.logLevel);
            });
            structureWatcher.on('structure-error', (event) => {
                if (structureConfig.mode === 'strict') {
                    (0, structure_log_1.logDevBlocked)();
                    currentStructureState = {
                        state: 'error',
                        issues: event.issues,
                        routeGraph: [],
                        timestamp: event.timestamp,
                    };
                    // Push structure error to browser via SSE
                    const overlayMessage = (0, structure_log_1.formatIssuesForOverlay)(currentStructureState, structureConfig.includeWarningsInOverlay);
                    const errorData = JSON.stringify({
                        type: 'structure-error',
                        message: overlayMessage,
                    });
                    sseClients.forEach((client) => {
                        client.write(`data: ${errorData}\n\n`);
                    });
                }
            });
            structureWatcher.on('structure-ok', (event) => {
                const wasBlocked = currentStructureState?.state === 'error' && structureConfig.mode === 'strict';
                currentStructureState = {
                    state: 'ok',
                    issues: event.issues,
                    routeGraph: [],
                    timestamp: event.timestamp,
                };
                if (wasBlocked) {
                    (0, structure_log_1.logDevUnblocked)();
                    const data = JSON.stringify({ type: 'structure-ok' });
                    sseClients.forEach((client) => {
                        client.write(`data: ${data}\n\n`);
                    });
                }
            });
            (0, structure_log_1.logWatcherStart)();
            structureWatcher.start().catch((err) => {
                console.error('[vista:validate] Failed to start structure watcher:', err);
            });
        }
    }
    // Serve static files (public)
    app.use(express_1.default.static(path_1.default.join(cwd, 'public')));
    // Image optimization endpoint
    const imageHandler = (0, image_optimizer_1.createImageHandler)(cwd, isDev);
    app.get(constants_1.IMAGE_ENDPOINT, imageHandler);
    // Serve .vista build artifacts with proper routing
    // /_vista/static/* -> .vista/static/*
    app.use(`${constants_1.URL_PREFIX}/static`, express_1.default.static(path_1.default.join(cwd, constants_1.BUILD_DIR, 'static')));
    // Legacy: Serve .vista root for backward compatibility (client.css, etc.)
    app.use(express_1.default.static(path_1.default.join(cwd, constants_1.BUILD_DIR)));
    app.use(async (req, res, next) => {
        if (req.path.startsWith('/styles.css') || req.path.startsWith('/__webpack_hmr')) {
            return next();
        }
        await (0, request_context_1.runWithRequestContext)({
            req,
            res,
            cwd,
            vistaDirRoot,
            urlPath: req.path,
        }, async () => {
            // ====================================================================
            // Structure validation gate (strict-block in dev)
            // ====================================================================
            if (isDev &&
                structureConfig.enabled &&
                structureConfig.mode === 'strict' &&
                currentStructureState?.state === 'error') {
                const overlayMessage = (0, structure_log_1.formatIssuesForOverlay)(currentStructureState, structureConfig.includeWarningsInOverlay);
                const errorInfo = {
                    type: 'build',
                    message: `Structure Validation Failed\n\n${overlayMessage}`,
                };
                res.status(500).send((0, dev_error_1.renderErrorHTML)([errorInfo]));
                return;
            }
            // MIDDLEWARE SUPPORT
            const middlewareResult = await (0, middleware_runner_1.runMiddleware)(req, cwd, isDev);
            const finalized = (0, middleware_runner_1.applyMiddlewareResult)(middlewareResult, req, res);
            if (finalized)
                return;
            const resolvedRoute = (0, typed_api_runtime_1.resolveRouteHandler)(cwd, req.path);
            if (resolvedRoute) {
                try {
                    await (0, typed_api_runtime_1.runRouteHandler)({
                        req,
                        res,
                        apiPath: resolvedRoute.filePath,
                        isDev,
                        params: resolvedRoute.params,
                    });
                    return;
                }
                catch (error) {
                    console.error(`[vista:ssr] Route handler error: ${error?.message ?? String(error)}`);
                    return res.status(500).json({ error: 'Internal Server Error in route handler' });
                }
            }
            // API ROUTES SUPPORT - Next.js App Router Style
            if (req.path.startsWith('/api/')) {
                const typedHandled = await (0, typed_api_runtime_1.runTypedApiRoute)({
                    req,
                    res,
                    cwd,
                    isDev,
                    config: typedApiConfig,
                });
                if (typedHandled) {
                    return;
                }
                return res.status(404).json({ error: 'API Route Not Found' });
            }
            // ==================================================================
            // Static / ISR Cache Check
            // ==================================================================
            {
                const cached = (0, static_cache_1.getCachedPage)(req.path);
                if (cached.page) {
                    const pprRequestMode = (0, ppr_1.resolvePprRequestMode)({
                        headerValue: req.headers['x-vista-prerender'],
                        queryValue: req.query?.__vista_prerender,
                    });
                    const servePprShell = pprRequestMode === 'shell' && Boolean(cached.page.shellHtml);
                    const responseHtml = servePprShell ? cached.page.shellHtml : cached.page.html;
                    res
                        .status(200)
                        .type('text/html')
                        .setHeader('X-Vista-Cache', cached.stale ? 'STALE' : 'HIT');
                    if (cached.page.ppr?.enabled) {
                        const responseMode = pprRequestMode === 'resume' ? 'RESUME' : servePprShell ? 'SHELL' : 'PPR';
                        res.setHeader('X-Vista-Prerender', responseMode);
                        res.setHeader('X-Vista-Prerender-Resume', cached.page.ppr.resumePath);
                        res.setHeader('X-Vista-Prerender-Strategy', cached.page.ppr.strategy);
                        res.setHeader('Vary', appendVaryHeader(res.getHeader('Vary'), 'x-vista-prerender'));
                    }
                    res.setHeader('X-Vista-Route-Runtime', 'nodejs');
                    res.send(responseHtml);
                    return;
                }
            }
            try {
                let pagePath;
                let params = {};
                // Route Matching Logic
                const getExactPath = (p) => {
                    if (p === '/' || p === '/index')
                        return path_1.default.resolve(cwd, 'app', 'index.tsx');
                    return path_1.default.resolve(cwd, 'app', p.substring(1), 'page.tsx');
                };
                const tryPath = getExactPath(req.path);
                // Clear require cache for hot reloading in dev
                if (isDev) {
                    Object.keys(require.cache).forEach((key) => {
                        if (key.includes(cwd) && key.includes('app')) {
                            delete require.cache[key];
                        }
                    });
                }
                if (fs_1.default.existsSync(tryPath)) {
                    pagePath = tryPath;
                }
                else {
                    // Dynamic Route Matching
                    const segments = req.path.split('/').filter(Boolean);
                    const appDir = path_1.default.resolve(cwd, 'app');
                    if (segments.length === 2) {
                        const [section, paramVal] = segments;
                        const sectionPath = path_1.default.join(appDir, section);
                        if (fs_1.default.existsSync(sectionPath) && fs_1.default.statSync(sectionPath).isDirectory()) {
                            const subEntries = fs_1.default.readdirSync(sectionPath, { withFileTypes: true });
                            const dynamicFolder = subEntries.find((d) => d.isDirectory() &&
                                d.name.startsWith('[') &&
                                d.name.endsWith(']') &&
                                d.name !== '[not-found]');
                            if (dynamicFolder) {
                                const paramName = dynamicFolder.name.slice(1, -1);
                                params[paramName] = paramVal;
                                pagePath = path_1.default.join(sectionPath, dynamicFolder.name, 'page.tsx');
                            }
                        }
                    }
                }
                const rootLayout = (0, root_resolver_1.resolveRootLayout)(cwd, isDev);
                // 404 Handling
                if (!pagePath || !fs_1.default.existsSync(pagePath)) {
                    const resolvedNotFound = (0, root_resolver_1.resolveNotFoundComponent)(cwd, rootLayout, isDev);
                    if (resolvedNotFound) {
                        renderApp(req, res, resolvedNotFound.component, rootLayout.component, {}, { ...(rootLayout.metadata || {}), title: '404 Not Found' }, vistaConfig, 404, isDev, rootLayout.mode);
                        return;
                    }
                    res.status(404).type('text/html').send((0, not_found_page_1.getStyledNotFoundHTML)());
                    return;
                }
                // Load Modules
                const PageModule = require(pagePath);
                const PageComponent = PageModule.default;
                const RootComponent = rootLayout.component;
                if (!PageComponent) {
                    res.status(500).send('<h1>Page does not export default component</h1>');
                    return;
                }
                // Data Fetching
                let props = {};
                if (PageModule.getServerProps) {
                    props = await PageModule.getServerProps({ query: req.query, params, req });
                }
                // Resolve the full nested layout chain (root → page directory)
                const pageDir = path_1.default.dirname(pagePath);
                const layouts = (0, root_resolver_1.resolveLayoutChain)(cwd, pageDir, isDev);
                // Metadata extraction - merge all layout metadata + page metadata
                let metadata = {};
                for (const layout of layouts) {
                    if (layout.metadata) {
                        metadata = { ...metadata, ...layout.metadata };
                    }
                }
                // Get page static metadata (overrides layouts)
                if (PageModule.metadata) {
                    metadata = { ...metadata, ...PageModule.metadata };
                }
                // Get dynamic metadata from generateMetadata function
                if (typeof PageModule.generateMetadata === 'function') {
                    try {
                        const dynamicMeta = await PageModule.generateMetadata({ params, searchParams: req.query }, metadata // parent metadata
                        );
                        metadata = { ...metadata, ...dynamicMeta };
                    }
                    catch (e) {
                        console.error('Error in generateMetadata:', e);
                    }
                }
                // Render with nested layouts
                renderApp(req, res, PageComponent, RootComponent, { ...props, params }, metadata, vistaConfig, 200, isDev, rootLayout.mode, layouts.length > 0 ? layouts : undefined);
            }
            catch (err) {
                if (err?.name === 'NotFoundError') {
                    try {
                        const rootLayout = (0, root_resolver_1.resolveRootLayout)(cwd, isDev);
                        const resolvedNotFound = (0, root_resolver_1.resolveNotFoundComponent)(cwd, rootLayout, isDev);
                        if (resolvedNotFound) {
                            renderApp(req, res, resolvedNotFound.component, rootLayout.component, {}, { ...(rootLayout.metadata || {}), title: '404 Not Found' }, vistaConfig, 404, isDev, rootLayout.mode);
                            return;
                        }
                        res.status(404).type('text/html').send((0, not_found_page_1.getStyledNotFoundHTML)());
                        return;
                    }
                    catch (notFoundError) {
                        console.error(`[vista:ssr] Failed to render NotFoundError fallback: ${notFoundError?.message ?? String(notFoundError)}`);
                    }
                }
                console.error(`[vista:ssr] Render error: ${err?.message || 'Unknown error'}`);
                if (process.env.VISTA_DEBUG) {
                    console.error(err);
                }
                // Render Server-Side Error Overlay
                const errorInfo = {
                    type: 'runtime',
                    message: err.message || 'Unknown Server Error',
                    stack: err.stack,
                    file: (err.message.match && err.message.match(/(app\/.*?):(\d+):(\d+)/)?.[1]) || undefined,
                };
                res.status(500).send((0, dev_error_1.renderErrorHTML)([errorInfo]));
            }
        });
    });
    const server = app.listen(finalPort, () => {
        (0, logger_1.printServerReady)({ port: finalPort, mode: 'legacy' });
    });
    server.on('error', (error) => {
        if (error?.code === 'EADDRINUSE') {
            (0, logger_1.logError)(`Port ${finalPort} is already in use.`);
            process.exit(1);
            return;
        }
        (0, logger_1.logError)(`Startup failed: ${error?.message || String(error)}`);
        if (process.env.VISTA_DEBUG) {
            console.error(error);
        }
        process.exit(1);
    });
}
// Helper to encapsulate Render Logic
function renderApp(req, res, PageComponent, RootComponent, props, metadata, config, status = 200, isDev = false, rootMode = 'legacy', 
/** Optional full layout chain (outermost → innermost). When provided, RootComponent is ignored. */
layouts) {
    // Import RouterContext from the router module
    const { RouterContext } = require('../client/router');
    const { generateMetadataHtml } = require('../metadata/generate');
    // Create router context value matching client structure
    const routerValue = {
        push: () => { },
        replace: () => { },
        back: () => { },
        forward: () => { },
        prefetch: () => { },
        refresh: () => { },
        params: props.params || {},
        pathname: req.path,
    };
    // Build the nested layout tree: Layout0 > Layout1 > ... > Page
    let pageTree = react_1.default.createElement(PageComponent, props);
    if (layouts && layouts.length > 0) {
        // Wrap page in layouts from innermost to outermost
        for (let i = layouts.length - 1; i >= 0; i--) {
            const LayoutComp = layouts[i].component;
            pageTree = react_1.default.createElement(LayoutComp, { params: props.params || {} }, pageTree);
        }
    }
    else {
        // Fallback: single root layout wrapping page
        pageTree = react_1.default.createElement(RootComponent, { params: props.params || {} }, pageTree);
    }
    // App content that will be hydrated inside #root
    const appContent = react_1.default.createElement(RouterContext.Provider, { value: routerValue }, pageTree);
    const appElement = rootMode === 'document'
        ? react_1.default.createElement(RouterContext.Provider, { value: routerValue }, pageTree)
        : (() => {
            // Full HTML document shell - legacy mode.
            const criticalCss = `
                html, body { background: #0a0a0a; color: #ededed; }
                html.light, html.light body { background: #ffffff; color: #171717; }
            `;
            const themeScript = `
                (function() {
                    var d = document.documentElement;
                    d.classList.add('dark');
                    d.classList.remove('light');
                    d.style.colorScheme = 'dark';
                    window.${constants_1.THEME_SETTER} = function(newTheme) {
                        d.classList.remove('light', 'dark');
                        d.classList.add(newTheme);
                        d.style.colorScheme = newTheme;
                    };
                })();
            `;
            return react_1.default.createElement('html', { lang: 'en', className: 'dark' }, react_1.default.createElement('head', null, react_1.default.createElement('style', {
                dangerouslySetInnerHTML: { __html: criticalCss },
                'data-vista-critical': 'true',
            }), react_1.default.createElement('script', {
                dangerouslySetInnerHTML: { __html: themeScript },
            })), react_1.default.createElement('body', { className: 'antialiased' }, react_1.default.createElement('div', { id: 'root' }, appContent)));
        })();
    let didError = false;
    // Generate metadata HTML from metadata object
    let metadataHtml = '';
    if (metadata) {
        try {
            metadataHtml = generateMetadataHtml(metadata);
        }
        catch (e) {
            console.error('Error generating metadata HTML:', e);
        }
    }
    const injectStream = new stream_1.Transform({
        transform(chunk, encoding, callback) {
            let chunkString = chunk.toString();
            if (chunkString.includes('</head>')) {
                // Inject metadata + CSS + Charset
                const fontHtml = (0, registry_1.getAllFontHTML)();
                const headInjection = `<meta charset="utf-8" />${metadataHtml}${fontHtml}<link rel="stylesheet" href="/client.css">`;
                chunkString = chunkString.replace('</head>', `${headInjection}</head>`);
            }
            if (chunkString.includes('</body>')) {
                const hydrationScript = `
                    <script>window.__VISTA_HYDRATE_DOCUMENT__ = ${rootMode === 'document' ? 'true' : 'false'};</script>
                    <script>
                        window.__INITIAL_PROPS__ = ${JSON.stringify(props)};
                        window.__VISTA_CONFIG__ = ${JSON.stringify(config)};
                    </script>
                    <script src="/vista-client-manifest.js"></script>
                    <script src="/client.js"></script>
                `;
                chunkString = chunkString.replace('</body>', `${hydrationScript}</body>`);
            }
            this.push(chunkString);
            callback();
        },
    });
    const stream = (0, server_1.renderToPipeableStream)(appElement, {
        onShellReady() {
            res.statusCode = didError ? 500 : status;
            res.setHeader('Content-type', 'text/html; charset=utf-8');
            stream.pipe(injectStream).pipe(res);
        },
        onShellError(err) {
            res.statusCode = 500;
            res.send('<!doctype html><p>Loading...</p>');
        },
        onError(err) {
            didError = true;
            console.error(`[vista:ssr] Stream error: ${err?.message || 'Unknown stream error'}`);
            if (process.env.VISTA_DEBUG) {
                console.error(err);
            }
        },
    });
}
function appendVaryHeader(existing, nextValue) {
    const values = String(existing || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    if (!values.includes(nextValue)) {
        values.push(nextValue);
    }
    return values.join(', ');
}
