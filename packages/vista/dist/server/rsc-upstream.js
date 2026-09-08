"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const react_1 = __importDefault(require("react"));
const stream_1 = require("stream");
const url_1 = require("url");
const react_client_reference_manifest_1 = require("../build/rsc/react-client-reference-manifest");
const root_resolver_1 = require("./root-resolver");
const constants_1 = require("../constants");
const module_compile_hook_1 = require("./module-compile-hook");
const request_context_1 = require("./request-context");
const runtime_actions_1 = require("./runtime-actions");
const app_router_runtime_1 = require("./app-router-runtime");
const fetch_policy_1 = require("./fetch-policy");
const runtime_artifacts_1 = require("./runtime-artifacts");
const config_1 = require("../config");
const vista_import_map_1 = require("./vista-import-map");
const project_alias_resolver_1 = require("./project-alias-resolver");
// NOTE: RouteErrorBoundary and RouteSuspense are 'use client' components.
// Under --conditions react-server, React.Component is not available, so we
// must NOT import them at the top level.  Instead we lazy-require them after
// the client-load hook has been installed (which turns them into Flight
// client references automatically).
let _RouteErrorBoundary = null;
let _RouteSuspense = null;
function getRouteErrorBoundary() {
    if (!_RouteErrorBoundary) {
        _RouteErrorBoundary = require('../components/error-boundary').RouteErrorBoundary;
    }
    return _RouteErrorBoundary;
}
function getRouteSuspense() {
    if (!_RouteSuspense) {
        _RouteSuspense = require('../components/route-suspense').RouteSuspense;
    }
    return _RouteSuspense;
}
const CjsModule = require('module');
if (process.env.NODE_PATH) {
    try {
        CjsModule._initPaths();
    }
    catch (_err) {
        // ignore
    }
}
// Support CSS imports on server runtime
require.extensions['.css'] = (m, filename) => {
    if (filename.endsWith('.module.css')) {
        m.exports = {};
    }
};
let installedClientLoadHook = false;
let originalCompile = null;
let reactResolutionInstalled = false;
let originalResolveFilename = null;
const clientDirectiveCache = new Map();
function resolveVistaInternalRequest(request) {
    return (0, vista_import_map_1.resolveVistaSourceRequest)(request, path_1.default.resolve(__dirname, '..'));
}
function parseCliArg(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1)
        return undefined;
    return process.argv[index + 1];
}
function resolvePort(defaultPort) {
    const raw = parseCliArg('--port') ?? process.env.RSC_UPSTREAM_PORT ?? String(defaultPort);
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid upstream port: ${raw}`);
    }
    return port;
}
function resolveFromWorkspace(specifier, cwd) {
    const searchRoots = [
        cwd,
        path_1.default.resolve(cwd, '..'),
        path_1.default.resolve(cwd, '..', '..'),
        path_1.default.resolve(cwd, '..', '..', 'rsc'),
        path_1.default.resolve(cwd, '..', '..', '..'),
        path_1.default.resolve(cwd, '..', '..', '..', 'rsc'),
    ];
    for (const root of searchRoots) {
        try {
            return require.resolve(specifier, { paths: [root] });
        }
        catch {
            // continue
        }
    }
    return require.resolve(specifier);
}
function normalizeModulePath(filePath) {
    return filePath.replace(/\\/g, '/').toLowerCase();
}
function shouldInvalidateDevModule(modulePath, cwd) {
    const normalized = normalizeModulePath(modulePath);
    const rootPrefix = normalizeModulePath(`${cwd}${path_1.default.sep}`);
    if (!normalized.startsWith(rootPrefix))
        return false;
    if (normalized.includes('/node_modules/'))
        return false;
    if (normalized.includes(`/${constants_1.BUILD_DIR.toLowerCase()}/`))
        return false;
    return /\.(?:[cm]?[jt]sx?|json)$/i.test(normalized);
}
function clearProjectRequireCache(cwd) {
    for (const key of Object.keys(require.cache)) {
        if (!shouldInvalidateDevModule(key, cwd))
            continue;
        delete require.cache[key];
        clientDirectiveCache.delete(key);
    }
}
function setupTypeScriptRuntime(cwd) {
    try {
        const swcRegisterPath = resolveFromWorkspace('@swc-node/register/register', cwd);
        const typescriptPath = resolveFromWorkspace('typescript', cwd);
        const { register } = require(swcRegisterPath);
        const ts = require(typescriptPath);
        register({
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.ReactJSX,
            moduleResolution: ts.ModuleResolutionKind.Node16,
            esModuleInterop: true,
            allowJs: true,
        });
        return;
    }
    catch {
        // fallback
    }
    try {
        const tsNodePath = resolveFromWorkspace('ts-node', cwd);
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
        return;
    }
    catch {
        // fallback
    }
    try {
        const tsxPath = resolveFromWorkspace('tsx/cjs', cwd);
        // tsx/cjs registers the TypeScript loader for require()
        require(tsxPath);
        return;
    }
    catch {
        throw new Error('No TypeScript compiler available for RSC upstream runtime. Install one of: @swc-node/register, ts-node, or tsx');
    }
}
function hasClientBoundaryDirective(source) {
    let trimmed = source;
    while (true) {
        trimmed = trimmed.trimStart();
        if (trimmed.startsWith('//')) {
            const newlineIndex = trimmed.indexOf('\n');
            trimmed = newlineIndex === -1 ? '' : trimmed.slice(newlineIndex + 1);
            continue;
        }
        if (trimmed.startsWith('/*')) {
            const commentEndIndex = trimmed.indexOf('*/');
            if (commentEndIndex === -1) {
                break;
            }
            trimmed = trimmed.slice(commentEndIndex + 2);
            continue;
        }
        break;
    }
    return trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"');
}
function isClientBoundaryFile(filename, transpiledSource) {
    const cached = clientDirectiveCache.get(filename);
    if (cached !== undefined)
        return cached;
    let isClient = false;
    try {
        const originalSource = fs_1.default.readFileSync(filename, 'utf-8');
        isClient = hasClientBoundaryDirective(originalSource);
    }
    catch {
        isClient = hasClientBoundaryDirective(transpiledSource);
    }
    clientDirectiveCache.set(filename, isClient);
    return isClient;
}
function installSingleReactResolution(cwd) {
    if (reactResolutionInstalled)
        return;
    let reactPath;
    let reactDomPath;
    try {
        reactPath = require.resolve('react');
        reactDomPath = require.resolve('react-dom');
    }
    catch {
        return;
    }
    originalResolveFilename = CjsModule._resolveFilename;
    const projectAliasResolver = (0, project_alias_resolver_1.createProjectAliasResolver)(cwd, resolveFromWorkspace);
    CjsModule._resolveFilename = function (request, parent, isMain, options) {
        const vistaResolvedPath = resolveVistaInternalRequest(request);
        if (vistaResolvedPath)
            return vistaResolvedPath;
        const aliasResolvedPath = projectAliasResolver?.resolve(request);
        if (aliasResolvedPath) {
            return originalResolveFilename.call(this, aliasResolvedPath, parent, isMain, options);
        }
        if (request === 'react')
            return reactPath;
        if (request === 'react-dom')
            return reactDomPath;
        if (request.startsWith('react/')) {
            const subPath = request.slice('react/'.length);
            try {
                return require.resolve(`react/${subPath}`, { paths: [path_1.default.dirname(reactPath)] });
            }
            catch {
                // fall through
            }
        }
        if (request.startsWith('react-dom/')) {
            const subPath = request.slice('react-dom/'.length);
            try {
                return require.resolve(`react-dom/${subPath}`, { paths: [path_1.default.dirname(reactDomPath)] });
            }
            catch {
                // fall through
            }
        }
        if (request === 'react-server-dom-webpack' || request.startsWith('react-server-dom-webpack/')) {
            try {
                return resolveFromWorkspace(request, cwd);
            }
            catch {
                // fall through
            }
        }
        return originalResolveFilename.call(this, request, parent, isMain, options);
    };
    reactResolutionInstalled = true;
}
function installClientLoadHook(cwd, createClientModuleProxy) {
    if (installedClientLoadHook)
        return;
    const cacheComponentsConfig = (0, config_1.resolveCacheComponentsConfig)((0, config_1.loadConfig)(cwd));
    (0, module_compile_hook_1.installModuleCompileHook)({
        cwd,
        createClientModuleProxy,
        cacheComponentsEnabled: cacheComponentsConfig.enabled,
    });
    installedClientLoadHook = true;
}
function matchPattern(pathname, pattern) {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    if (patternParts.length === 0 && pathParts.length === 0)
        return true;
    for (let i = 0; i < patternParts.length; i++) {
        const patternPart = patternParts[i];
        const pathPart = pathParts[i];
        // Optional catch-all: matches zero or more segments
        if (patternPart.endsWith('*?')) {
            return true;
        }
        // Required catch-all: matches one or more remaining segments
        if (patternPart.endsWith('*')) {
            return pathParts.length >= i + 1;
        }
        if (patternPart.startsWith(':')) {
            if (!pathPart)
                return false;
            continue;
        }
        if (patternPart !== pathPart)
            return false;
    }
    return patternParts.length === pathParts.length;
}
function matchRoute(pathname, routes) {
    const sorted = [...routes].sort((a, b) => {
        const aOptional = a.pattern.includes('*?');
        const bOptional = b.pattern.includes('*?');
        if (aOptional && !bOptional)
            return 1;
        if (!aOptional && bOptional)
            return -1;
        return b.pattern.split('/').length - a.pattern.split('/').length;
    });
    for (const route of sorted) {
        if (matchPattern(pathname, route.pattern))
            return route;
    }
    return null;
}
function extractParams(pathname, route) {
    const params = {};
    const patternParts = route.pattern.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    for (let i = 0; i < patternParts.length; i++) {
        const patternPart = patternParts[i];
        if (!patternPart.startsWith(':'))
            continue;
        const name = patternPart.slice(1).replace(/\*\??/, '');
        if (patternPart.endsWith('*?') || patternPart.endsWith('*')) {
            params[name] = pathParts.slice(i).join('/');
        }
        else {
            params[name] = pathParts[i] || '';
        }
    }
    return params;
}
async function createRenderableRouteModuleElement(modulePath, context, options = {}) {
    const { params, searchParams, req } = context;
    const RouteModule = require(modulePath);
    const RouteComponent = RouteModule.default;
    if (!RouteComponent) {
        throw new Error(`Route module does not export default component: ${modulePath}`);
    }
    if (options.evaluateMetadata && typeof RouteModule.generateMetadata === 'function') {
        await RouteModule.generateMetadata({ params, searchParams }, RouteModule.metadata ?? {});
    }
    const routeProps = typeof RouteModule.getServerProps === 'function'
        ? await RouteModule.getServerProps({ query: req.query, params, req })
        : {};
    const moduleStem = path_1.default.basename(modulePath).replace(/\.[jt]sx?$/, '');
    if (moduleStem === 'default' || moduleStem === 'not-found') {
        const eagerResult = await RouteComponent({
            ...routeProps,
            params,
            searchParams,
        });
        return react_1.default.isValidElement(eagerResult)
            ? eagerResult
            : react_1.default.createElement(react_1.default.Fragment, null, eagerResult);
    }
    return react_1.default.createElement(RouteComponent, {
        ...routeProps,
        params,
        searchParams,
    });
}
function applySegmentBoundaries(dir, element) {
    const loadingPath = (0, app_router_runtime_1.resolveConventionModule)(dir, 'loading');
    const errorPath = (0, app_router_runtime_1.resolveConventionModule)(dir, 'error');
    const loadingComponent = loadingPath
        ? (() => {
            try {
                return require(loadingPath).default;
            }
            catch {
                return undefined;
            }
        })()
        : undefined;
    const errorComponent = errorPath
        ? (() => {
            try {
                return require(errorPath).default;
            }
            catch {
                return undefined;
            }
        })()
        : undefined;
    let wrappedElement = element;
    if (loadingComponent) {
        wrappedElement = react_1.default.createElement(getRouteSuspense(), {
            loadingComponent,
            children: wrappedElement,
        });
    }
    if (errorComponent) {
        wrappedElement = react_1.default.createElement(getRouteErrorBoundary(), {
            fallbackComponent: errorComponent,
            children: wrappedElement,
        });
    }
    return wrappedElement;
}
async function renderAppSubtreeElement(input) {
    const appDir = path_1.default.join(input.cwd, 'app');
    let element = await createRenderableRouteModuleElement(input.entryFilePath, {
        params: input.params,
        searchParams: input.searchParams,
        req: input.req,
    }, {
        evaluateMetadata: input.evaluateLeafMetadata,
    });
    const directoryChain = (0, app_router_runtime_1.resolveDirectoryChain)(input.subtreeRootDir, input.entryFilePath);
    for (let i = directoryChain.length - 1; i >= 0; i--) {
        const dir = directoryChain[i];
        element = applySegmentBoundaries(dir, element);
        const layoutPath = (0, app_router_runtime_1.resolveConventionModule)(dir, 'root') ?? (0, app_router_runtime_1.resolveConventionModule)(dir, 'layout');
        if (!layoutPath || path_1.default.resolve(layoutPath) === path_1.default.resolve(input.entryFilePath)) {
            continue;
        }
        const LayoutModule = require(layoutPath);
        const LayoutComponent = LayoutModule.default;
        if (!LayoutComponent) {
            continue;
        }
        const slotProps = {};
        if (!input.disableParallelSlots) {
            const slotMatches = (0, app_router_runtime_1.resolveParallelSlotMatches)({
                appDir,
                layoutPath,
                pathname: input.pathname,
            });
            for (const slotMatch of slotMatches) {
                slotProps[slotMatch.slotName] = await renderAppSubtreeElement({
                    subtreeRootDir: slotMatch.slotRootDir,
                    entryFilePath: slotMatch.filePath,
                    pathname: input.pathname,
                    params: {
                        ...input.params,
                        ...slotMatch.params,
                    },
                    searchParams: input.searchParams,
                    req: input.req,
                    cwd: input.cwd,
                    evaluateLeafMetadata: true,
                });
            }
        }
        element = react_1.default.createElement(LayoutComponent, {
            params: input.params,
            searchParams: input.searchParams,
            ...slotProps,
        }, element);
    }
    return element;
}
async function createRouteElement(route, context, isDev, runtimeRoot, options = {}) {
    const { pathname, params, searchParams, req } = context;
    if (isDev) {
        clearProjectRequireCache(runtimeRoot);
    }
    return renderAppSubtreeElement({
        subtreeRootDir: path_1.default.join(runtimeRoot, 'app'),
        entryFilePath: route.pagePath,
        pathname,
        params,
        searchParams,
        req,
        cwd: runtimeRoot,
        evaluateLeafMetadata: true,
        disableParallelSlots: options.disableParallelSlots,
    });
}
async function readRawRequestBody(req) {
    if (typeof req.body === 'string') {
        return Buffer.from(req.body);
    }
    if (Buffer.isBuffer(req.body)) {
        return req.body;
    }
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
async function parseMultipartFormData(req, rawBody) {
    const request = new Request(`http://127.0.0.1${req.originalUrl || req.url || '/'}`, {
        method: req.method || 'POST',
        headers: req.headers,
        body: rawBody,
    });
    return request.formData();
}
function getSearchParamsFromRequest(req) {
    return Object.fromEntries(new URLSearchParams(req.query).entries());
}
function startUpstream() {
    const cwd = path_1.default.resolve(process.env.VISTA_ARTIFACT_ROOT || process.cwd());
    const runtimeRoot = (0, runtime_artifacts_1.resolveRuntimeProjectRoot)(cwd, process.env.VISTA_RUNTIME_ROOT);
    const isDev = process.env.NODE_ENV !== 'production';
    const port = resolvePort(3101);
    const vistaDirRoot = path_1.default.join(cwd, constants_1.BUILD_DIR);
    installSingleReactResolution(runtimeRoot);
    setupTypeScriptRuntime(runtimeRoot);
    const flightServerPath = resolveFromWorkspace('react-server-dom-webpack/server.node', cwd);
    const flightServer = require(flightServerPath);
    if (typeof flightServer.registerServerReference === 'function') {
        (0, runtime_actions_1.setRegisterServerReference)(flightServer.registerServerReference);
    }
    installClientLoadHook(runtimeRoot, flightServer.createClientModuleProxy);
    (0, fetch_policy_1.installSegmentFetchPolicyShim)();
    const serverManifestPath = path_1.default.join(cwd, constants_1.BUILD_DIR, 'server', 'server-manifest.json');
    const flightManifestPath = path_1.default.join(cwd, constants_1.BUILD_DIR, 'react-client-manifest.json');
    if (!fs_1.default.existsSync(serverManifestPath)) {
        throw new Error('Missing RSC server manifest. Run "vista build" first.');
    }
    // In dev mode the flight manifest may not exist yet (webpack-dev-middleware
    // hasn't completed the first compilation).  Write a stub so we can start,
    // and reload on each request.
    if (!fs_1.default.existsSync(flightManifestPath)) {
        if (isDev) {
            fs_1.default.writeFileSync(flightManifestPath, '{}');
        }
        else {
            throw new Error('Missing RSC flight manifest. Run "vista build" first.');
        }
    }
    let serverManifest = JSON.parse(fs_1.default.readFileSync(serverManifestPath, 'utf-8'));
    let flightManifest = (0, react_client_reference_manifest_1.normalizeReactClientReferenceManifest)(JSON.parse(fs_1.default.readFileSync(flightManifestPath, 'utf-8')));
    const app = (0, express_1.default)();
    const pipeFlightModel = async (res, model, status) => {
        let capturedError = null;
        let gateResolved = false;
        let streamEnded = false;
        const gateStream = new stream_1.PassThrough();
        const bufferedChunks = [];
        const finishGate = (() => {
            let resolver = null;
            const promise = new Promise((resolve) => {
                resolver = () => {
                    if (gateResolved) {
                        return;
                    }
                    gateResolved = true;
                    resolve();
                };
            });
            return { promise, resolve: () => resolver?.() };
        })();
        const onData = (chunk) => {
            bufferedChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            finishGate.resolve();
        };
        gateStream.on('data', onData);
        gateStream.once('end', () => {
            streamEnded = true;
            finishGate.resolve();
        });
        gateStream.once('error', () => {
            finishGate.resolve();
        });
        const stream = flightServer.renderToPipeableStream(model, flightManifest, {
            onError(error) {
                capturedError = error;
                if (error?.name !== 'NotFoundError') {
                    console.error('[vista:rsc] Upstream flight render error:', error);
                }
                finishGate.resolve();
            },
        });
        stream.pipe(gateStream);
        const gateTimer = setTimeout(() => finishGate.resolve(), 75);
        await finishGate.promise;
        clearTimeout(gateTimer);
        if (capturedError?.name === 'NotFoundError') {
            gateStream.destroy();
            throw capturedError;
        }
        gateStream.off('data', onData);
        res.status(status);
        res.setHeader('Content-Type', 'text/x-component');
        res.setHeader('Vary', 'Accept');
        for (const chunk of bufferedChunks) {
            res.write(chunk);
        }
        if (streamEnded) {
            res.end();
            return;
        }
        gateStream.pipe(res);
    };
    const drainFlightModel = async (model) => {
        let capturedError = null;
        const sink = new stream_1.PassThrough();
        const completion = new Promise((resolve, reject) => {
            sink.on('data', () => { });
            sink.once('end', resolve);
            sink.once('error', reject);
        });
        const stream = flightServer.renderToPipeableStream(model, flightManifest, {
            onError(error) {
                if (!capturedError) {
                    capturedError = error;
                }
            },
        });
        stream.pipe(sink);
        await completion;
        if (capturedError) {
            throw capturedError;
        }
    };
    const resolveActionModulePath = (actionId) => {
        const hashIdx = actionId.lastIndexOf('#');
        const modulePath = hashIdx >= 0 ? actionId.slice(0, hashIdx) : actionId;
        if (!modulePath.startsWith('file://')) {
            return modulePath;
        }
        try {
            return (0, url_1.fileURLToPath)(modulePath);
        }
        catch {
            let fallbackPath = modulePath.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
            if (process.platform === 'win32' && /^[a-zA-Z]:/.test(fallbackPath) === false) {
                fallbackPath = '/' + fallbackPath;
            }
            return fallbackPath;
        }
    };
    const primeInlineActionRegistration = async (req, actionId) => {
        const actionEntry = serverManifest.serverActions?.[actionId];
        if (!actionEntry || actionEntry.kind !== 'inline') {
            return undefined;
        }
        const pathname = req.path.replace(/^\/(?:_rsc|rsc)/, '') || '/';
        const searchParams = getSearchParamsFromRequest(req);
        const actionRoute = matchRoute(pathname, serverManifest.routes) ||
            serverManifest.routes.find((candidate) => {
                const targetPath = path_1.default.resolve(actionEntry.filePath);
                return (path_1.default.resolve(candidate.pagePath) === targetPath ||
                    candidate.layoutPaths.some((layoutPath) => path_1.default.resolve(layoutPath) === targetPath));
            }) ||
            null;
        const resolvedActionPath = path_1.default.resolve(actionEntry.filePath || resolveActionModulePath(actionId));
        const routeParams = actionRoute ? extractParams(pathname, actionRoute) : {};
        if (isDev) {
            try {
                delete require.cache[require.resolve(resolvedActionPath)];
            }
            catch {
                // ignore missing cache entries
            }
        }
        const actionModule = require(resolvedActionPath);
        if (typeof actionModule?.default === 'function') {
            const probeProps = {
                params: routeParams,
                searchParams,
            };
            if (actionRoute && path_1.default.resolve(actionRoute.pagePath) !== resolvedActionPath) {
                probeProps.children = null;
            }
            try {
                await actionModule.default(probeProps);
            }
            catch {
                // Some components require a fuller tree to evaluate. Fall through to route priming.
            }
            const directResolution = (0, runtime_actions_1.resolveRegisteredServerReference)(actionId);
            if (directResolution) {
                return directResolution;
            }
        }
        if (actionRoute) {
            const params = routeParams;
            const model = await createRouteElement(actionRoute, { pathname, params, searchParams, req }, isDev, runtimeRoot);
            await drainFlightModel(model);
            return (0, runtime_actions_1.resolveRegisteredServerReference)(actionId);
        }
        return undefined;
    };
    const handleRSCRequest = async (req, res) => {
        const pathname = req.path.replace(/^\/(?:_rsc|rsc)/, '') || '/';
        await (0, request_context_1.runWithRequestContext)({
            req,
            res,
            cwd: runtimeRoot,
            vistaDirRoot,
            urlPath: pathname,
        }, async () => {
            try {
                // In dev mode, reload manifests from disk on each request so we
                // always pick up the latest output from ReactFlightWebpackPlugin.
                if (isDev) {
                    try {
                        serverManifest = JSON.parse(fs_1.default.readFileSync(serverManifestPath, 'utf-8'));
                        flightManifest = (0, react_client_reference_manifest_1.normalizeReactClientReferenceManifest)(JSON.parse(fs_1.default.readFileSync(flightManifestPath, 'utf-8')));
                    }
                    catch {
                        // Manifests may be mid-write; use whatever we have cached.
                    }
                }
                const route = matchRoute(pathname, serverManifest.routes);
                (0, request_context_1.setCurrentSegmentConfig)(route?.segmentConfig);
                if (!route) {
                    const rootLayout = (0, root_resolver_1.resolveRootLayout)(runtimeRoot, isDev);
                    const resolvedNotFound = (0, root_resolver_1.resolveNotFoundComponent)(runtimeRoot, rootLayout, isDev);
                    let model;
                    if (resolvedNotFound) {
                        const notFoundElement = react_1.default.createElement(resolvedNotFound.component, {
                            params: {},
                            searchParams: {},
                        });
                        model = react_1.default.createElement(rootLayout.component, { params: {}, searchParams: {} }, notFoundElement);
                    }
                    else {
                        model = react_1.default.createElement('div', {
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100vh',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                background: '#0a0a0a',
                                color: '#ededed',
                                margin: 0,
                                overflow: 'hidden',
                                textAlign: 'center',
                                userSelect: 'none',
                            },
                        }, react_1.default.createElement('span', {
                            style: {
                                fontSize: '6rem',
                                fontWeight: 800,
                                letterSpacing: '-0.04em',
                                lineHeight: 1,
                                background: 'linear-gradient(135deg, #7c3aed, #2563eb, #06b6d4)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                            },
                        }, '404'), react_1.default.createElement('p', {
                            style: {
                                marginTop: '0.75rem',
                                fontSize: '0.95rem',
                                fontWeight: 400,
                                color: '#555',
                                letterSpacing: '0.02em',
                            },
                        }, "There's nothing here."));
                    }
                    await pipeFlightModel(res, model, 404);
                    return;
                }
                const params = extractParams(pathname, route);
                const searchParams = getSearchParamsFromRequest(req);
                const element = await createRouteElement(route, { pathname, params, searchParams, req }, isDev, runtimeRoot);
                await pipeFlightModel(res, element, 200);
            }
            catch (error) {
                if (error?.name === 'NotFoundError') {
                    try {
                        const rootLayout = (0, root_resolver_1.resolveRootLayout)(runtimeRoot, isDev);
                        const route = matchRoute(pathname, serverManifest.routes);
                        (0, request_context_1.setCurrentSegmentConfig)(route?.segmentConfig);
                        if (route) {
                            const segmentNotFoundPath = (0, app_router_runtime_1.resolveNearestSegmentNotFoundPath)(path_1.default.join(runtimeRoot, 'app'), route.routeDir);
                            if (segmentNotFoundPath) {
                                const params = extractParams(pathname, route);
                                const searchParams = getSearchParamsFromRequest(req);
                                const model = await createRouteElement({
                                    ...route,
                                    pagePath: segmentNotFoundPath,
                                }, { pathname, params, searchParams, req }, isDev, runtimeRoot, { disableParallelSlots: true });
                                await pipeFlightModel(res, model, 404);
                                return;
                            }
                        }
                        const resolvedNotFound = (0, root_resolver_1.resolveNotFoundComponent)(runtimeRoot, rootLayout, isDev);
                        let model;
                        if (resolvedNotFound) {
                            const notFoundElement = react_1.default.createElement(resolvedNotFound.component, {
                                params: {},
                                searchParams: {},
                            });
                            model = react_1.default.createElement(rootLayout.component, { params: {}, searchParams: {} }, notFoundElement);
                        }
                        else {
                            model = react_1.default.createElement('h1', null, '404 - Page Not Found');
                        }
                        await pipeFlightModel(res, model, 404);
                        return;
                    }
                    catch (notFoundError) {
                        console.error('[vista:rsc] Failed to render NotFoundError fallback:', notFoundError);
                    }
                }
                console.error('[vista:rsc] Upstream request failed:', error);
                res
                    .status(500)
                    .type('text/plain')
                    .send(error.message);
            }
        });
    };
    app.get(/^\/(?:_rsc|rsc)(?:\/.*)?$/, handleRSCRequest);
    // -----------------------------------------------------------------------
    // Server Actions — POST handler
    // -----------------------------------------------------------------------
    app.use(express_1.default.text({ type: 'text/plain', limit: '10mb' }));
    const handleServerAction = async (req, res) => {
        const pathname = req.path.replace(/^\/(?:_rsc|rsc)/, '') || '/';
        await (0, request_context_1.runWithRequestContext)({
            req,
            res,
            cwd: runtimeRoot,
            vistaDirRoot,
            urlPath: pathname,
        }, async () => {
            try {
                const actionId = req.headers['rsc-action'];
                if (!actionId) {
                    res.status(400).type('text/plain').send('Missing rsc-action header');
                    return;
                }
                if (isDev) {
                    try {
                        serverManifest = JSON.parse(fs_1.default.readFileSync(serverManifestPath, 'utf-8'));
                        flightManifest = JSON.parse(fs_1.default.readFileSync(flightManifestPath, 'utf-8'));
                    }
                    catch {
                        // Keep cached manifests if they're being rewritten.
                    }
                }
                (0, request_context_1.setCurrentSegmentConfig)(matchRoute(pathname, serverManifest.routes)?.segmentConfig);
                let actionFn = (0, runtime_actions_1.resolveRegisteredServerReference)(actionId);
                if (!actionFn) {
                    actionFn = await primeInlineActionRegistration(req, actionId);
                }
                if (!actionFn) {
                    const hashIdx = actionId.lastIndexOf('#');
                    const exportName = hashIdx >= 0 ? actionId.slice(hashIdx + 1) : 'default';
                    const resolvedPath = resolveActionModulePath(actionId);
                    if (isDev) {
                        try {
                            delete require.cache[require.resolve(resolvedPath)];
                        }
                        catch {
                            // ignore missing cache entries
                        }
                    }
                    const actionModule = require(resolvedPath);
                    actionFn = actionModule[exportName];
                }
                if (typeof actionFn !== 'function') {
                    res.status(404).type('text/plain').send(`Server action not found: ${actionId}`);
                    return;
                }
                const rawBody = await readRawRequestBody(req);
                const contentType = String(req.headers['content-type'] || '');
                let result;
                if (contentType.includes('multipart/form-data')) {
                    const formData = await parseMultipartFormData(req, rawBody);
                    const boundAction = await flightServer.decodeAction(formData, flightManifest);
                    result = await boundAction();
                }
                else {
                    const args = (await flightServer.decodeReply(rawBody.toString('utf-8'), flightManifest));
                    result = await actionFn(...(Array.isArray(args) ? args : [args]));
                }
                const revalidatedPaths = (0, request_context_1.consumeRevalidatedPaths)();
                if (revalidatedPaths.length > 0) {
                    res.setHeader('x-vista-revalidated-paths', JSON.stringify(revalidatedPaths));
                }
                const revalidatedTags = (0, request_context_1.consumeRevalidatedTags)();
                if (revalidatedTags.length > 0) {
                    res.setHeader('x-vista-revalidated-tags', JSON.stringify(revalidatedTags));
                }
                res.setHeader('Content-Type', 'text/x-component');
                const stream = flightServer.renderToPipeableStream(result, flightManifest, {
                    onError(error) {
                        console.error('[vista:rsc] Server action render error:', error);
                    },
                });
                stream.pipe(res);
            }
            catch (error) {
                console.error('[vista:rsc] Server action failed:', error);
                res
                    .status(500)
                    .type('text/plain')
                    .send(error.message);
            }
        });
    };
    app.post(/^\/(?:_rsc|rsc)(?:\/.*)?$/, handleServerAction);
    const server = app.listen(port, () => {
        console.log(`[vista:rsc:upstream] Listening on http://127.0.0.1:${port}/rsc`);
    });
    server.on('error', (error) => {
        if (error?.code === 'EADDRINUSE') {
            console.error(`[vista:server] Port ${port} is already in use.`);
            process.exit(1);
            return;
        }
        console.error('[vista:server] RSC upstream startup failed:', error);
        process.exit(1);
    });
}
startUpstream();
