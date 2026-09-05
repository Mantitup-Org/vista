"use strict";
/**
 * Vista RSC Web Engine
 *
 * Serves SSR HTML and proxies Flight requests to a dedicated upstream process
 * that runs with `--conditions react-server`.
 *
 * SSR renders Flight streams into HTML using renderToPipeableStream,
 * with a shim __webpack_require__ to resolve client modules during SSR.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRSCServer = startRSCServer;
exports.default = startRSCServer;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const express_1 = __importDefault(require("express"));
const react_1 = __importDefault(require("react"));
const server_1 = require("react-dom/server");
const webpack_dev_middleware_1 = __importDefault(require("webpack-dev-middleware"));
const stream_1 = require("stream");
const child_process_1 = require("child_process");
const url_1 = require("url");
const middleware_runner_1 = require("./middleware-runner");
const image_optimizer_1 = require("./image-optimizer");
const ppr_1 = require("./ppr");
const registry_1 = require("../font/registry");
const logger_1 = require("./logger");
const not_found_page_1 = require("./not-found-page");
const static_cache_1 = require("./static-cache");
const static_generator_1 = require("./static-generator");
const react_client_reference_manifest_1 = require("../build/rsc/react-client-reference-manifest");
const constants_1 = require("../constants");
const CjsModule = require('module');
// ---------------------------------------------------------------------------
// SSR Webpack Shim
// ---------------------------------------------------------------------------
// The Flight SSR decoder (react-server-dom-webpack/client.node) calls
// __webpack_require__(specifier) to load client components during SSR.
// In Vista the SSR process runs in plain Node.js (not through webpack),
// so we provide a shim that converts file:// URLs to absolute paths and
// delegates to Node's require().
// ---------------------------------------------------------------------------
function installSSRWebpackShim() {
    if (typeof globalThis.__webpack_require__ === 'function')
        return;
    globalThis.__webpack_require__ = function ssrWebpackRequire(specifier) {
        let modulePath = specifier;
        // Convert file:// URLs to absolute paths
        if (specifier.startsWith('file://')) {
            try {
                modulePath = (0, url_1.fileURLToPath)(specifier);
            }
            catch {
                modulePath = specifier;
            }
        }
        return require(modulePath);
    };
    // Chunk loading is a no-op on the server — all code is already local.
    globalThis.__webpack_chunk_load__ = function ssrChunkLoad(_chunkId) {
        return Promise.resolve();
    };
}
const config_1 = require("../config");
const dev_error_1 = require("../dev-error");
const artifact_validator_1 = require("./artifact-validator");
const root_resolver_1 = require("./root-resolver");
const runtime_artifacts_1 = require("./runtime-artifacts");
const spawn_permissions_1 = require("./spawn-permissions");
const structure_watch_1 = require("./structure-watch");
const structure_log_1 = require("./structure-log");
const error_boundary_1 = require("../components/error-boundary");
const route_suspense_1 = require("../components/route-suspense");
const typed_api_runtime_1 = require("./typed-api-runtime");
const module_compile_hook_1 = require("./module-compile-hook");
const request_context_1 = require("./request-context");
const app_router_runtime_1 = require("./app-router-runtime");
const fetch_policy_1 = require("./fetch-policy");
const vista_import_map_1 = require("./vista-import-map");
const project_alias_resolver_1 = require("./project-alias-resolver");
// Support CSS imports on server runtime
// - Regular .css: ignored (handled by PostCSS)
// - .module.css: return empty class mapping (webpack build handles real mappings)
require.extensions['.css'] = (m, filename) => {
    if (filename.endsWith('.module.css')) {
        m.exports = {};
    }
};
/**
 * Generate CSS link tags for the document head.
 * Includes the PostCSS globals and CSS Modules extracted stylesheet.
 */
function getCSSLinks(projectRoot) {
    const root = projectRoot || process.env.VISTA_ARTIFACT_ROOT || process.cwd();
    const links = ['<link rel="stylesheet" href="/styles.css" />'];
    // Check for extracted CSS modules (from MiniCssExtractPlugin)
    const chunksDir = path_1.default.join(root, constants_1.BUILD_DIR, 'static', 'chunks');
    try {
        if (fs_1.default.existsSync(chunksDir)) {
            const files = fs_1.default.readdirSync(chunksDir).filter((f) => f.endsWith('.css'));
            for (const f of files) {
                links.push(`<link rel="stylesheet" href="${constants_1.STATIC_CHUNKS_PATH}${f}" />`);
            }
        }
    }
    catch {
        // Ignore errors during directory scan
    }
    return links.join('\n  ');
}
function parseCliArg(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1)
        return undefined;
    return process.argv[index + 1];
}
function resolvePort(raw, fallback) {
    const value = Number(raw || String(fallback));
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`Invalid port: ${raw}`);
    }
    return value;
}
function removeStaticArtifacts(vistaDirRoot, urlPath) {
    const staticDir = path_1.default.join(vistaDirRoot, 'static', 'pages');
    const safePath = urlPath === '/' ? '/index' : urlPath;
    const artifactPaths = ['.html', '.meta.json', '.rsc'].map((extension) => path_1.default.join(staticDir, `${safePath}${extension}`));
    for (const absolutePath of artifactPaths) {
        try {
            if (fs_1.default.existsSync(absolutePath)) {
                fs_1.default.unlinkSync(absolutePath);
            }
        }
        catch {
            // ignore cache cleanup failures
        }
    }
}
function parseRevalidationHeader(rawValue) {
    if (!rawValue) {
        return [];
    }
    try {
        const parsed = JSON.parse(rawValue);
        return Array.isArray(parsed) ? parsed.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
    }
    catch {
        return [];
    }
}
function applyUpstreamRevalidations(upstream, vistaDirRoot) {
    const revalidatedPaths = parseRevalidationHeader(upstream.headers.get('x-vista-revalidated-paths'));
    for (const urlPath of revalidatedPaths) {
        (0, static_cache_1.invalidateCachedPage)(urlPath);
        removeStaticArtifacts(vistaDirRoot, urlPath);
    }
    const revalidatedTags = parseRevalidationHeader(upstream.headers.get('x-vista-revalidated-tags'));
    for (const tag of revalidatedTags) {
        const affectedPaths = (0, static_cache_1.invalidateCachedPagesByTag)(tag);
        for (const urlPath of affectedPaths) {
            removeStaticArtifacts(vistaDirRoot, urlPath);
        }
    }
}
function normalizeModuleCachePath(filePath) {
    return filePath.replace(/\\/g, '/').toLowerCase();
}
function shouldInvalidateDevModule(modulePath, cwd) {
    const normalized = normalizeModuleCachePath(modulePath);
    const rootPrefix = normalizeModuleCachePath(`${cwd}${path_1.default.sep}`);
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
    }
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
        require(tsxPath);
        return;
    }
    catch (e) {
        console.log('Failed to setup TypeScript runtime:', e);
        // No TypeScript compiler found
    }
}
let reactResolutionInstalled = false;
let originalResolveFilename = null;
function resolveVistaInternalRequest(request) {
    return (0, vista_import_map_1.resolveVistaSourceRequest)(request, path_1.default.resolve(__dirname, '..'));
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
        try {
            reactPath = require.resolve('react', { paths: [cwd] });
            reactDomPath = require.resolve('react-dom', { paths: [cwd] });
        }
        catch {
            return;
        }
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
        return originalResolveFilename.call(this, request, parent, isMain, options);
    };
    reactResolutionInstalled = true;
}
function withTimeout(url, options = {}, timeoutMs = 3000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout))
        .catch((error) => {
        if (error.name === 'AbortError') {
            throw new Error(`Timed out after ${timeoutMs}ms: ${url}`);
        }
        throw error;
    });
}
function cleanHotUpdateFiles(cwd) {
    const chunksDir = path_1.default.join(cwd, constants_1.BUILD_DIR, 'static', 'chunks');
    if (!fs_1.default.existsSync(chunksDir))
        return;
    for (const f of fs_1.default.readdirSync(chunksDir)) {
        if (f.includes('.hot-update.')) {
            try {
                fs_1.default.unlinkSync(path_1.default.join(chunksDir, f));
            }
            catch { }
        }
    }
}
function findChunkFiles(cwd, isDev) {
    const chunksDir = path_1.default.join(cwd, constants_1.BUILD_DIR, 'static', 'chunks');
    if (!fs_1.default.existsSync(chunksDir))
        return [];
    const files = fs_1.default
        .readdirSync(chunksDir)
        .filter((name) => name.endsWith('.js') && !name.endsWith('.map') && !name.includes('.hot-update.'));
    // In dev, avoid loading stale production artifacts left from a previous build.
    // Production chunks end with a hash suffix like `main-1a2b3c4d.js`.
    const normalizedFiles = isDev
        ? files.filter((name) => !/-[0-9a-f]{8,}\.js$/i.test(name))
        : files;
    // Load webpack runtime first, then framework, then the rest alphabetically.
    // This ensures the chunk registry (__webpack_require__) is available before
    // any deferred chunk tries to self-register.
    const priority = ['webpack.js', 'framework.js', 'vendor.js'];
    return normalizedFiles.sort((a, b) => {
        const ai = priority.indexOf(a);
        const bi = priority.indexOf(b);
        if (ai !== -1 && bi !== -1)
            return ai - bi;
        if (ai !== -1)
            return -1;
        if (bi !== -1)
            return 1;
        return a.localeCompare(b);
    });
}
function normalizeSSRManifest(manifest) {
    if (!manifest || !manifest.moduleMap) {
        return manifest;
    }
    const moduleMap = manifest.moduleMap;
    const aliasEntries = [];
    const pushAlias = (key, exportsMap) => {
        if (!key)
            return;
        aliasEntries.push([key, exportsMap]);
        // React Flight may request module IDs with/without a trailing '#'.
        if (key.endsWith('#')) {
            aliasEntries.push([key.slice(0, -1), exportsMap]);
        }
        else {
            aliasEntries.push([`${key}#`, exportsMap]);
        }
        // Normalize URI encoding variants for Windows paths with spaces, etc.
        if (key.startsWith('file://')) {
            try {
                const decoded = decodeURI(key);
                if (decoded !== key) {
                    aliasEntries.push([decoded, exportsMap]);
                    aliasEntries.push([decoded.endsWith('#') ? decoded.slice(0, -1) : `${decoded}#`, exportsMap]);
                }
            }
            catch {
                // ignore decode failures
            }
            try {
                const encoded = encodeURI(key);
                if (encoded !== key) {
                    aliasEntries.push([encoded, exportsMap]);
                    aliasEntries.push([encoded.endsWith('#') ? encoded.slice(0, -1) : `${encoded}#`, exportsMap]);
                }
            }
            catch {
                // ignore encode failures
            }
        }
    };
    for (const [moduleKey, exportsMap] of Object.entries(moduleMap)) {
        const normalizedExports = {};
        for (const [exportName, rawEntry] of Object.entries(exportsMap || {})) {
            const entry = rawEntry || {};
            const normalizedId = String(entry.id ?? entry.specifier ?? moduleKey);
            normalizedExports[exportName] = {
                id: normalizedId,
                chunks: Array.isArray(entry.chunks) ? entry.chunks : [],
                name: entry.name || exportName,
            };
        }
        moduleMap[moduleKey] = normalizedExports;
        pushAlias(moduleKey, normalizedExports);
        for (const normalizedEntry of Object.values(normalizedExports)) {
            const aliasKey = String(normalizedEntry.id);
            pushAlias(aliasKey, normalizedExports);
        }
    }
    for (const [aliasKey, exportsMap] of aliasEntries) {
        if (!moduleMap[aliasKey]) {
            moduleMap[aliasKey] = exportsMap;
        }
    }
    return manifest;
}
function loadSSRManifestFromDisk(absolutePath) {
    const manifest = (0, react_client_reference_manifest_1.normalizeReactServerConsumerManifest)(JSON.parse(fs_1.default.readFileSync(absolutePath, 'utf-8')));
    return normalizeSSRManifest(manifest);
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
            return true; // matches even with zero remaining segments
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
    // Sort routes: more specific patterns first, optional catch-all last
    const sorted = [...routes].sort((a, b) => {
        const aOptional = a.pattern.includes('*?');
        const bOptional = b.pattern.includes('*?');
        if (aOptional && !bOptional)
            return 1;
        if (!aOptional && bOptional)
            return -1;
        // More segments = more specific
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
        wrappedElement = react_1.default.createElement(route_suspense_1.RouteSuspense, {
            loadingComponent,
            children: wrappedElement,
        });
    }
    if (errorComponent) {
        wrappedElement = react_1.default.createElement(error_boundary_1.RouteErrorBoundary, {
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
async function createRouteElement(route, context, isDev, rootLayout, runtimeRoot, options = {}) {
    const { params, searchParams, req } = context;
    if (isDev) {
        clearProjectRequireCache(runtimeRoot);
    }
    const PageModule = require(route.pagePath);
    let metadata = { ...(rootLayout.metadata || {}) };
    if (PageModule.metadata) {
        metadata = { ...metadata, ...PageModule.metadata };
    }
    if (typeof PageModule.generateMetadata === 'function') {
        const dynamicMeta = await PageModule.generateMetadata({ params, searchParams }, metadata);
        metadata = { ...metadata, ...dynamicMeta };
    }
    const element = await renderAppSubtreeElement({
        subtreeRootDir: path_1.default.join(runtimeRoot, 'app'),
        entryFilePath: route.pagePath,
        pathname: req.path,
        params,
        searchParams,
        req,
        cwd: runtimeRoot,
        evaluateLeafMetadata: false,
        disableParallelSlots: options.disableParallelSlots,
    });
    return { element, metadata, rootMode: rootLayout.mode };
}
function injectBeforeClosingTag(html, tagName, injection) {
    const closeTag = `</${tagName}>`;
    if (html.includes(closeTag)) {
        return html.replace(closeTag, `${injection}\n${closeTag}`);
    }
    return html;
}
function createHtmlDocument(appHtml, metadataHtml, chunkFiles, rootMode = 'legacy') {
    const scripts = chunkFiles
        .map((chunk) => `<script defer src="${constants_1.STATIC_CHUNKS_PATH}${chunk}"></script>`)
        .join('\n  ');
    if (rootMode === 'document' ||
        /^\s*<!doctype html>\s*<html/i.test(appHtml) ||
        /^\s*<html/i.test(appHtml)) {
        const fontHtml = (0, registry_1.getAllFontHTML)();
        const headInjection = `\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  ${metadataHtml}\n  ${fontHtml}\n  ${getCSSLinks()}`;
        const bodyInjection = `\n  <script>window.${constants_1.HYDRATE_DOCUMENT_FLAG} = true;</script>\n  ${scripts}`;
        let html = appHtml;
        if (!/^\s*<!doctype html>/i.test(html)) {
            html = `<!DOCTYPE html>\n${html}`;
        }
        html = injectBeforeClosingTag(html, 'head', headInjection);
        html = injectBeforeClosingTag(html, 'body', bodyInjection);
        return html;
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden}</style>
  ${metadataHtml}
  ${(0, registry_1.getAllFontHTML)()}
  ${getCSSLinks()}
</head>
<body>
  <script>window.${constants_1.HYDRATE_DOCUMENT_FLAG} = false;</script>
  <div id="root">${appHtml}</div>
  ${scripts}
</body>
</html>`;
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
async function handleApiRoute(req, res, runtimeRoot, isDev, typedApiConfig) {
    try {
        // File-based `route.*` handlers are resolved by the caller, for `/api/*` as well
        // as any other path, so only the typed API remains to try here.
        const typedHandled = await (0, typed_api_runtime_1.runTypedApiRoute)({
            req,
            res,
            cwd: runtimeRoot,
            isDev,
            config: typedApiConfig,
        });
        if (typedHandled) {
            return;
        }
        res.status(404).json({ error: 'API Route Not Found' });
    }
    catch (error) {
        console.error('[vista:rsc] API route error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
function spawnUpstream(cwd, runtimeRoot, upstreamPort) {
    const upstreamScript = path_1.default.join(__dirname, 'rsc-upstream.js');
    try {
        return {
            child: (0, child_process_1.spawn)(process.execPath, ['--conditions', 'react-server', upstreamScript, '--port', String(upstreamPort)], {
                cwd,
                env: {
                    ...process.env,
                    NODE_ENV: process.env.NODE_ENV || 'development',
                    RSC_UPSTREAM_PORT: String(upstreamPort),
                    VISTA_ARTIFACT_ROOT: cwd,
                    VISTA_RUNTIME_ROOT: runtimeRoot,
                },
                stdio: 'pipe',
            }),
            unavailableReason: null,
        };
    }
    catch (error) {
        if ((0, spawn_permissions_1.isPermissionDeniedSpawnError)(error)) {
            return {
                child: null,
                unavailableReason: `spawn blocked by environment permissions (${(0, spawn_permissions_1.getErrorMessage)(error)})`,
            };
        }
        throw error;
    }
}
// ---------------------------------------------------------------------------
// Flight-Based SSR Rendering Helpers
// ---------------------------------------------------------------------------
/**
 * Fetch the Flight stream from the upstream RSC process, decode it with
 * createFromNodeStream, and render the resulting React tree to an HTML stream
 * via renderToPipeableStream.
 */
async function renderFlightToHTMLStream(upstreamOrigin, pathname, search, metadataHtml, chunkFiles, rootMode, flightSSRClient, ssrManifest, res, isDev) {
    const flightUrl = `${upstreamOrigin}/rsc${pathname}${search ? `?${search}` : ''}`;
    // 1. Fetch Flight stream from upstream
    const upstream = await withTimeout(flightUrl, {
        headers: { Accept: 'text/x-component' },
    }, 5000);
    if (!upstream.ok && upstream.status !== 404) {
        throw new Error(`Upstream returned ${upstream.status}: ${await upstream.text()}`);
    }
    if (!upstream.body) {
        throw new Error('Upstream returned empty body');
    }
    // 2. Convert Web ReadableStream to Node.js Readable
    const nodeStream = stream_1.Readable.fromWeb(upstream.body);
    // 3. Decode Flight stream into a React tree
    const flightResponse = flightSSRClient.createFromNodeStream(nodeStream, ssrManifest);
    let element;
    // In dev, decode the flight payload before React.use() render path.
    // This keeps manifest mismatch errors in the request try/catch boundary
    // instead of crashing the whole process with an uncaught exception.
    if (isDev) {
        const resolvedTree = await flightResponse;
        element = react_1.default.createElement(react_1.default.Fragment, null, resolvedTree);
    }
    else {
        // 4. Wrap in a component that consumes the Flight response
        function FlightRoot() {
            return react_1.default.use(flightResponse);
        }
        element = react_1.default.createElement(FlightRoot);
    }
    // 5. Build script tags for client chunks
    const scripts = chunkFiles
        .map((chunk) => `<script defer src="${constants_1.STATIC_CHUNKS_PATH}${chunk}"></script>`)
        .join('\n  ');
    // 6. Render to a pipeable HTML stream
    return new Promise((resolve, reject) => {
        let shellSent = false;
        const { pipe } = (0, server_1.renderToPipeableStream)(element, {
            onShellReady() {
                shellSent = true;
                res.status(upstream.status === 404 ? 404 : 200);
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Transfer-Encoding', 'chunked');
                // Create a transform stream to inject head/body content
                const transform = new stream_1.Transform({
                    transform(chunk, _encoding, callback) {
                        let html = chunk.toString();
                        // Inject into <head> if present
                        if (html.includes('</head>')) {
                            const fontHtml = (0, registry_1.getAllFontHTML)();
                            const headInjection = `
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${metadataHtml}
  ${fontHtml}
  ${getCSSLinks()}`;
                            html = html.replace('</head>', `${headInjection}\n</head>`);
                        }
                        // Inject scripts before </body>
                        if (html.includes('</body>')) {
                            const bodyInjection = `
  <script>window.${constants_1.HYDRATE_DOCUMENT_FLAG} = ${rootMode === 'document'};</script>
  ${scripts}`;
                            html = html.replace('</body>', `${bodyInjection}\n</body>`);
                        }
                        callback(null, html);
                    },
                });
                pipe(transform);
                transform.pipe(res);
            },
            onShellError(error) {
                if (!shellSent) {
                    reject(error);
                }
            },
            onError(error) {
                if (isDev) {
                    console.error('[vista:rsc] Flight SSR stream error:', error);
                }
            },
            onAllReady() {
                resolve();
            },
        });
    });
}
/**
 * Wraps content in a document shell when the root layout doesn't provide one.
 * Used as fallback when the Flight stream doesn't include <html>/<head>/<body>.
 */
function wrapInDocumentShell(bodyContent, metadataHtml, chunkFiles, rootMode) {
    const scripts = chunkFiles
        .map((chunk) => `<script defer src="${constants_1.STATIC_CHUNKS_PATH}${chunk}"></script>`)
        .join('\n  ');
    if (rootMode === 'document' ||
        /^\s*<!doctype html>\s*<html/i.test(bodyContent) ||
        /^\s*<html/i.test(bodyContent)) {
        const fontHtml = (0, registry_1.getAllFontHTML)();
        const headInjection = `\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  ${metadataHtml}\n  ${fontHtml}\n  ${getCSSLinks()}`;
        const bodyInjection = `\n  <script>window.${constants_1.HYDRATE_DOCUMENT_FLAG} = true;</script>\n  ${scripts}`;
        let html = bodyContent;
        if (!/^\s*<!doctype html>/i.test(html)) {
            html = `<!DOCTYPE html>\n${html}`;
        }
        html = injectBeforeClosingTag(html, 'head', headInjection);
        html = injectBeforeClosingTag(html, 'body', bodyInjection);
        return html;
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden}</style>
  ${metadataHtml}
  ${(0, registry_1.getAllFontHTML)()}
  ${getCSSLinks()}
</head>
<body>
  <script>window.${constants_1.HYDRATE_DOCUMENT_FLAG} = false;</script>
  <div id="root">${bodyContent}</div>
  ${scripts}
</body>
</html>`;
}
function normalizeWebpackErrors(stats) {
    const errors = stats.toJson().errors || [];
    const normalizedErrors = errors
        .map((entry) => {
        if (typeof entry === 'string')
            return entry;
        if (entry && typeof entry.message === 'string')
            return entry.message;
        return String(entry || '');
    })
        .filter((entry) => entry.trim().length > 0);
    if (normalizedErrors.length > 0) {
        return normalizedErrors;
    }
    return ['Unknown build error.'];
}
function renderCompilePendingHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Compiling...</title>
  <style>
    html,body{height:100%;margin:0}
    body{
      display:grid;
      place-items:center;
      font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
      background:#09090b;
      color:#f4f4f5;
    }
    .vista-dev-pending{
      padding:20px 24px;
      border-radius:14px;
      border:1px solid rgba(255,255,255,0.15);
      background:rgba(17,17,20,0.92);
      box-shadow:0 18px 42px rgba(0,0,0,0.4);
      font-size:14px;
      letter-spacing:0.01em;
    }
  </style>
</head>
<body>
  <div class="vista-dev-pending">Vista is compiling the client bundle. Retrying...</div>
  <script>setTimeout(function(){window.location.reload();},700);</script>
</body>
</html>`;
}
function startRSCServer(options = {}) {
    const app = (0, express_1.default)();
    const cwd = path_1.default.resolve(options.projectRoot || process.env.VISTA_ARTIFACT_ROOT || process.cwd());
    const runtimeRoot = (0, runtime_artifacts_1.resolveRuntimeProjectRoot)(cwd, options.runtimeRoot);
    const isDev = process.env.NODE_ENV !== 'production';
    const vistaConfig = (0, config_1.loadConfig)(runtimeRoot);
    const cacheComponentsConfig = (0, config_1.resolveCacheComponentsConfig)(vistaConfig);
    const engineVariant = (0, config_1.resolveAndApplyEngineVariant)(vistaConfig);
    const typedApiConfig = (0, config_1.resolveTypedApiConfig)(vistaConfig);
    if (process.env.VISTA_DEBUG) {
        (0, logger_1.logInfo)(`Engine variant: ${engineVariant}`);
    }
    // Clean stale hot-update files from previous runs
    cleanHotUpdateFiles(cwd);
    // Request logger — logs GET/POST with timing
    app.use((0, logger_1.requestLogger)());
    const port = resolvePort(String(options.port || vistaConfig.server?.port || 3003), 3003);
    const upstreamPort = resolvePort(String(process.env.RSC_UPSTREAM_PORT || port + 1), port + 1);
    const upstreamOrigin = `http://127.0.0.1:${upstreamPort}`;
    installSingleReactResolution(runtimeRoot);
    setupTypeScriptRuntime(runtimeRoot);
    (0, module_compile_hook_1.installModuleCompileHook)({
        cwd: runtimeRoot,
        cacheComponentsEnabled: cacheComponentsConfig.enabled,
    });
    (0, fetch_policy_1.installSegmentFetchPolicyShim)();
    installSSRWebpackShim();
    const serverManifestPath = path_1.default.join(cwd, constants_1.BUILD_DIR, 'server', 'server-manifest.json');
    if (!fs_1.default.existsSync(serverManifestPath)) {
        console.error(`[vista:rsc] Missing server manifest at ${serverManifestPath}. Run "vista build --rsc" first.`);
        process.exit(1);
    }
    try {
        if (!isDev || !options.compiler) {
            (0, artifact_validator_1.assertVistaArtifacts)(cwd, 'rsc');
        }
    }
    catch (error) {
        console.error(error.message);
        process.exit(1);
    }
    // ========================================================================
    // Flight SSR Client + SSR Manifest
    // ========================================================================
    let flightSSRClient = null;
    let ssrManifest = null;
    try {
        const flightClientPath = resolveFromWorkspace('react-server-dom-webpack/client.node', cwd);
        flightSSRClient = require(flightClientPath);
    }
    catch (err) {
        // Flight SSR not available — fallback to renderToString
    }
    const ssrManifestPath = path_1.default.join(cwd, constants_1.BUILD_DIR, 'react-server-manifest.json');
    const ssrManifestLegacyPath = path_1.default.join(cwd, constants_1.BUILD_DIR, 'react-ssr-manifest.json');
    const resolvedSSRManifestPath = fs_1.default.existsSync(ssrManifestPath)
        ? ssrManifestPath
        : fs_1.default.existsSync(ssrManifestLegacyPath)
            ? ssrManifestLegacyPath
            : null;
    if (resolvedSSRManifestPath) {
        ssrManifest = loadSSRManifestFromDisk(resolvedSSRManifestPath);
    }
    else if (flightSSRClient) {
        // Can't use Flight SSR without the manifest
        flightSSRClient = null;
    }
    const useFlightSSR = !!flightSSRClient && !!ssrManifest;
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
    let serverManifest = JSON.parse(fs_1.default.readFileSync(serverManifestPath, 'utf-8'));
    // ========================================================================
    // Load pre-rendered static pages from disk into in-memory cache (production)
    // ========================================================================
    const vistaDirRoot = path_1.default.join(cwd, constants_1.BUILD_DIR);
    if (!isDev) {
        const loadedStaticPages = (0, static_cache_1.loadStaticPagesFromDisk)(vistaDirRoot);
        if (loadedStaticPages > 0) {
            (0, logger_1.logInfo)(`Loaded ${loadedStaticPages} pre-rendered page(s) from cache`);
        }
    }
    let upstreamStderr = '';
    const upstreamLaunch = spawnUpstream(cwd, runtimeRoot, upstreamPort);
    const upstreamChild = upstreamLaunch.child;
    let upstreamUnavailableReason = upstreamLaunch.unavailableReason;
    if (upstreamChild) {
        upstreamChild.stdout.setEncoding('utf8');
        upstreamChild.stderr.setEncoding('utf8');
        // Always capture stderr so we can log crash reasons
        if (process.env.VISTA_DEBUG) {
            upstreamChild.stdout.on('data', (chunk) => process.stdout.write(chunk));
            upstreamChild.stderr.on('data', (chunk) => {
                upstreamStderr += chunk;
                process.stderr.write(chunk);
            });
        }
        else {
            upstreamChild.stdout.on('data', () => { }); // drain
            upstreamChild.stderr.on('data', (chunk) => {
                upstreamStderr += chunk;
            });
        }
        upstreamChild.on('exit', (code, signal) => {
            if (code !== 0 || (code === null && !shutdownCalled)) {
                upstreamUnavailableReason = `process exited unexpectedly (code=${code ?? 'unknown'}, signal=${signal ?? 'null'})`;
                (0, logger_1.logError)(`Upstream exited unexpectedly (code=${code}, signal=${signal ?? 'null'})`);
                if (upstreamStderr.trim()) {
                    (0, logger_1.logError)(`Upstream stderr:\n${upstreamStderr.trim()}`);
                }
            }
        });
    }
    else if (upstreamUnavailableReason) {
        (0, logger_1.logError)(`[vista:rsc] ${upstreamUnavailableReason}`);
    }
    // Graceful shutdown — populated after all resources are created
    let shutdownCalled = false;
    let httpServer = null;
    let fsWatcher = null;
    const shutdown = () => {
        if (shutdownCalled)
            return;
        shutdownCalled = true;
        // 1. Kill upstream RSC child
        if (upstreamChild && !upstreamChild.killed) {
            upstreamChild.kill('SIGTERM');
            setTimeout(() => {
                if (!upstreamChild.killed)
                    upstreamChild.kill('SIGKILL');
            }, 800);
        }
        // 2. Close fs watcher
        if (fsWatcher) {
            try {
                fsWatcher.close();
            }
            catch { }
        }
        // 3. End all SSE connections
        sseReloadClients.forEach((c) => {
            try {
                c.end();
            }
            catch { }
        });
        sseReloadClients.clear();
        // 4. Stop structure watcher
        if (structureWatcher) {
            try {
                structureWatcher.stop();
            }
            catch { }
        }
        // 5. Close HTTP server
        if (httpServer) {
            httpServer.close();
        }
        // 6. Force exit after brief grace period (Windows Ctrl+C fix)
        setTimeout(() => process.exit(0), 500);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', shutdown);
    // ========================================================================
    // Live-Reload SSE for RSC dev mode
    // - Pushes reload events when server components change (fs.watch)
    // - Pushes compile errors/success from webpack client build
    // ========================================================================
    const sseReloadClients = new Set();
    let clientCompileState = isDev && options.compiler ? 'compiling' : 'ready';
    let clientCompileErrors = [];
    if (isDev) {
        app.get(constants_1.SSE_ENDPOINT, (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
            sseReloadClients.add(res);
            res.write('data: connected\n\n');
            req.on('close', () => {
                sseReloadClients.delete(res);
            });
        });
        const pushSSE = (payload) => {
            sseReloadClients.forEach((c) => c.write(`data: ${payload}\n\n`));
        };
        const watchExtPattern = /\.(?:[cm]?[jt]sx?|css|md|mdx|json)$/i;
        const watchRoots = [
            'app',
            'components',
            'content',
            'lib',
            'ctx',
            'data',
            'middleware.ts',
            'vista.config.ts',
            'content-collections.ts',
        ]
            .map((entry) => path_1.default.join(cwd, entry))
            .filter((entry) => fs_1.default.existsSync(entry));
        let reloadTimer = null;
        const scheduleReload = () => {
            if (reloadTimer)
                clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => {
                (0, logger_1.logEvent)('Source changed, reloading...');
                pushSSE('reload');
            }, 70);
        };
        try {
            const chokidar = require('chokidar');
            const watcher = chokidar.watch(watchRoots, {
                ignoreInitial: true,
                ignored: (watchedPath) => watchedPath.includes(`${path_1.default.sep}node_modules${path_1.default.sep}`) ||
                    watchedPath.includes(`${path_1.default.sep}.git${path_1.default.sep}`) ||
                    watchedPath.includes(`${path_1.default.sep}${constants_1.BUILD_DIR}${path_1.default.sep}`),
            });
            watcher.on('all', (_event, filePath) => {
                if (filePath && watchExtPattern.test(filePath)) {
                    scheduleReload();
                }
            });
            fsWatcher = watcher;
        }
        catch {
            const nativeWatchers = [];
            const onChange = (_event, filePath) => {
                if (filePath && watchExtPattern.test(filePath)) {
                    scheduleReload();
                }
            };
            for (const watchPath of watchRoots) {
                try {
                    const stat = fs_1.default.statSync(watchPath);
                    if (stat.isDirectory()) {
                        nativeWatchers.push(fs_1.default.watch(watchPath, { recursive: true }, onChange));
                    }
                    else {
                        nativeWatchers.push(fs_1.default.watch(watchPath, onChange));
                    }
                }
                catch {
                    // Skip missing or unsupported watch path.
                }
            }
            fsWatcher = {
                close: () => {
                    nativeWatchers.forEach((watcher) => watcher.close());
                },
            };
        }
    }
    if (isDev && options.compiler) {
        app.use((0, webpack_dev_middleware_1.default)(options.compiler, {
            publicPath: constants_1.STATIC_CHUNKS_PATH,
            stats: 'none',
            writeToDisk: true,
        }));
        // No webpack-hot-middleware — Vista uses SSE live-reload for RSC
        options.compiler.hooks.invalid.tap('VistaRSCCompileStateInvalid', () => {
            clientCompileState = 'compiling';
            clientCompileErrors = [];
        });
        // Push compile errors/success to SSE clients
        options.compiler.hooks.done.tap('VistaRSCLiveReload', (stats) => {
            if (stats.hasErrors()) {
                const normalizedErrors = normalizeWebpackErrors(stats);
                const fallback = normalizedErrors.join('\n\n');
                clientCompileState = 'error';
                clientCompileErrors = normalizedErrors;
                const payload = JSON.stringify({
                    type: 'error',
                    message: fallback,
                    errors: normalizedErrors,
                });
                sseReloadClients.forEach((c) => c.write(`data: ${payload}\n\n`));
            }
            else {
                clientCompileState = 'ready';
                clientCompileErrors = [];
                const payload = JSON.stringify({ type: 'ok' });
                sseReloadClients.forEach((c) => c.write(`data: ${payload}\n\n`));
            }
        });
        options.compiler.hooks.afterEmit.tap('VistaRSCServerManifestReload', () => {
            if (fs_1.default.existsSync(serverManifestPath)) {
                serverManifest = JSON.parse(fs_1.default.readFileSync(serverManifestPath, 'utf-8'));
            }
            // Reload SSR manifest on rebuild too
            if (resolvedSSRManifestPath && fs_1.default.existsSync(resolvedSSRManifestPath)) {
                ssrManifest = loadSSRManifestFromDisk(resolvedSSRManifestPath);
            }
        });
    }
    // ========================================================================
    // Structure Watcher SSE (RSC dev mode)
    // ========================================================================
    const sseStructureClients = new Set();
    app.get(constants_1.STRUCTURE_ENDPOINT, (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        sseStructureClients.add(res);
        res.write('data: connected\n\n');
        req.on('close', () => {
            sseStructureClients.delete(res);
        });
    });
    if (isDev && structureConfig.enabled) {
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
                const overlayMsg = (0, structure_log_1.formatIssuesForOverlay)(currentStructureState, structureConfig.includeWarningsInOverlay);
                const data = JSON.stringify({ type: 'structure-error', message: overlayMsg });
                sseStructureClients.forEach((c) => c.write(`data: ${data}\n\n`));
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
                sseStructureClients.forEach((c) => c.write(`data: ${data}\n\n`));
            }
        });
        (0, structure_log_1.logWatcherStart)();
        structureWatcher.start().catch((err) => {
            console.error('[vista:validate] Failed to start structure watcher:', err);
        });
    }
    app.get('/styles.css', (req, res) => {
        const cssPath = path_1.default.join(cwd, constants_1.BUILD_DIR, 'client.css');
        if (fs_1.default.existsSync(cssPath)) {
            res.setHeader('Content-Type', 'text/css');
            res.sendFile(cssPath);
            return;
        }
        res.status(404).type('text/css').send('/* CSS not found */');
    });
    // Image optimization endpoint
    const imageHandler = (0, image_optimizer_1.createImageHandler)(runtimeRoot, isDev);
    app.get(constants_1.IMAGE_ENDPOINT, imageHandler);
    app.use(express_1.default.static(path_1.default.join(runtimeRoot, 'public')));
    app.use(`${constants_1.URL_PREFIX}/static`, express_1.default.static(path_1.default.join(cwd, constants_1.BUILD_DIR, 'static')));
    app.use(constants_1.URL_PREFIX, express_1.default.static(path_1.default.join(cwd, constants_1.BUILD_DIR)));
    app.use(express_1.default.static(path_1.default.join(cwd, constants_1.BUILD_DIR)));
    const getUpstreamUnavailableMessage = () => `RSC upstream unavailable (${upstreamOrigin}/rsc): ${upstreamUnavailableReason || 'upstream process is not running'}`;
    const proxyRSCRequest = async (req, res) => {
        if (isDev && options.compiler) {
            if (clientCompileState === 'compiling') {
                res.status(503).type('text/plain').send('[vista] Client bundle is compiling. Retry shortly.');
                return;
            }
            if (clientCompileState === 'error') {
                res.status(500).type('text/plain').send(clientCompileErrors.join('\n\n'));
                return;
            }
        }
        if (upstreamUnavailableReason) {
            res.status(503).type('text/plain').send(getUpstreamUnavailableMessage());
            return;
        }
        try {
            const fetchOptions = {
                method: req.method,
                headers: { Accept: req.get('Accept') ?? 'text/x-component' },
            };
            // Forward Server Action headers and body for POST requests
            if (req.method === 'POST') {
                const rscAction = req.headers['rsc-action'];
                if (rscAction) {
                    fetchOptions.headers['rsc-action'] = rscAction;
                }
                const contentType = req.get('content-type');
                if (contentType) {
                    fetchOptions.headers['content-type'] = contentType;
                }
                // Collect the raw body
                const chunks = [];
                for await (const chunk of req) {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                }
                fetchOptions.body = Buffer.concat(chunks);
            }
            const upstream = await withTimeout(`${upstreamOrigin}${req.originalUrl}`, fetchOptions);
            applyUpstreamRevalidations(upstream, vistaDirRoot);
            res.status(upstream.status);
            const contentType = upstream.headers.get('content-type');
            if (contentType)
                res.setHeader('Content-Type', contentType);
            res.setHeader('Vary', 'Accept');
            if (!upstream.body) {
                res.end(await upstream.text());
                return;
            }
            stream_1.Readable.fromWeb(upstream.body).pipe(res);
        }
        catch (error) {
            res.status(503).type('text/plain').send(getUpstreamUnavailableMessage());
        }
    };
    app.get('/rsc*', proxyRSCRequest);
    app.get('/_rsc*', proxyRSCRequest);
    app.post('/rsc*', proxyRSCRequest);
    app.post('/_rsc*', proxyRSCRequest);
    // -------------------------------------------------------------------
    // User middleware (middleware.ts at project root)
    // -------------------------------------------------------------------
    app.use(async (req, res, next) => {
        // Skip internal paths — middleware should only run on page/API requests
        if (req.path === '/styles.css' ||
            req.path.startsWith('/_vista') ||
            req.path.startsWith('/__webpack_hmr') ||
            req.path.startsWith('/__vista_structure') ||
            req.path.startsWith('/rsc') ||
            req.path.startsWith('/_rsc')) {
            return next();
        }
        const result = await (0, middleware_runner_1.runMiddleware)(req, runtimeRoot, isDev);
        const finalized = (0, middleware_runner_1.applyMiddlewareResult)(result, req, res);
        if (finalized)
            return; // response already sent (redirect / short-circuit)
        next();
    });
    app.use(async (req, res, next) => {
        if (req.path === '/styles.css' ||
            req.path.startsWith('/_vista') ||
            req.path.startsWith('/__webpack_hmr') ||
            req.path.startsWith('/__vista_structure') ||
            req.path.startsWith('/rsc') ||
            req.path.startsWith('/_rsc')) {
            return next();
        }
        await (0, request_context_1.runWithRequestContext)({
            req,
            res,
            cwd: runtimeRoot,
            vistaDirRoot,
            urlPath: req.path,
        }, async () => {
            // ======================================================================
            // Structure validation gate (strict-block in dev)
            // ======================================================================
            if (isDev &&
                structureConfig.enabled &&
                structureConfig.mode === 'strict' &&
                currentStructureState?.state === 'error') {
                const overlayMessage = (0, structure_log_1.formatIssuesForOverlay)(currentStructureState, structureConfig.includeWarningsInOverlay);
                const errorInfo = {
                    type: 'build',
                    message: `Structure Validation Failed\n\n${overlayMessage}`,
                };
                res
                    .status(500)
                    .type('text/html')
                    .send((0, dev_error_1.renderErrorHTML)([errorInfo]));
                return;
            }
            if (isDev && options.compiler) {
                if (clientCompileState === 'compiling') {
                    res.status(503).type('text/html').send(renderCompilePendingHTML());
                    return;
                }
                if (clientCompileState === 'error') {
                    const errorInfos = (clientCompileErrors.length > 0
                        ? clientCompileErrors
                        : ['Unknown client build error.']).map((message) => ({ type: 'build', message }));
                    res.status(500).type('text/html').send((0, dev_error_1.renderErrorHTML)(errorInfos));
                    return;
                }
            }
            const routeHandlerMatch = (0, typed_api_runtime_1.resolveRouteHandlerMatch)(runtimeRoot, req.path, { isDev });
            if (routeHandlerMatch) {
                try {
                    await (0, typed_api_runtime_1.runLegacyApiRoute)({
                        req,
                        res,
                        apiPath: routeHandlerMatch.filePath,
                        params: routeHandlerMatch.params,
                        isDev,
                    });
                    return;
                }
                catch (error) {
                    console.error('[vista:rsc] Route handler error:', error);
                    res.status(500).json({ error: 'Internal Server Error' });
                    return;
                }
            }
            if (req.path.startsWith('/api/')) {
                await handleApiRoute(req, res, runtimeRoot, isDev, typedApiConfig);
                return;
            }
            const currentRoute = matchRoute(req.path, serverManifest.routes);
            (0, request_context_1.setCurrentSegmentConfig)(currentRoute?.segmentConfig);
            // ==================================================================
            // Static / ISR Cache Check
            // ==================================================================
            // Before dynamic rendering, check if we have a pre-rendered page.
            // For ISR pages whose revalidate window has expired, serve the stale
            // cached version immediately and kick off background revalidation.
            // ==================================================================
            if (!isDev) {
                const cached = (0, static_cache_1.getCachedPage)(req.path);
                if (cached.page) {
                    if (cached.stale) {
                        // ISR: serve stale page immediately, revalidate in background
                        const route = currentRoute;
                        if (route && !(0, static_cache_1.isRevalidating)(req.path)) {
                            const urlPath = req.path;
                            // Fire-and-forget background revalidation
                            (0, static_generator_1.revalidatePath)(urlPath, route, undefined, runtimeRoot, vistaDirRoot).catch((err) => {
                                console.error('[vista:isr] Background revalidation error:', err);
                            });
                        }
                    }
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
                    res.setHeader('X-Vista-Route-Runtime', currentRoute?.segmentConfig.runtime ?? 'nodejs');
                    res.send(responseHtml);
                    return;
                }
            }
            if (upstreamUnavailableReason) {
                res.status(503).type('text/plain').send(getUpstreamUnavailableMessage());
                return;
            }
            // ==================================================================
            // Flight-Based SSR Path
            // ==================================================================
            // If the Flight SSR client + SSR manifest are available, render pages
            // by fetching the Flight stream from upstream and using
            // renderToPipeableStream for streaming HTML with proper hydration.
            // Falls back to legacy renderToString if Flight SSR is unavailable.
            // ==================================================================
            if (useFlightSSR) {
                try {
                    if (isDev && resolvedSSRManifestPath && fs_1.default.existsSync(resolvedSSRManifestPath)) {
                        try {
                            ssrManifest = loadSSRManifestFromDisk(resolvedSSRManifestPath);
                        }
                        catch {
                            // Manifest may be mid-write during compilation; keep the last good in-memory copy.
                        }
                    }
                    // Metadata extraction: still done locally so we have <head> content
                    const rootLayout = (0, root_resolver_1.resolveRootLayout)(runtimeRoot, isDev);
                    const route = currentRoute;
                    let metadataHtml = '';
                    if (route) {
                        if (isDev) {
                            clearProjectRequireCache(runtimeRoot);
                        }
                        const PageModule = require(route.pagePath);
                        let metadata = { ...(rootLayout.metadata || {}) };
                        if (PageModule.metadata) {
                            metadata = { ...metadata, ...PageModule.metadata };
                        }
                        if (typeof PageModule.generateMetadata === 'function') {
                            const params = extractParams(req.path, route);
                            const searchParams = Object.fromEntries(new URLSearchParams(req.query).entries());
                            const dynamicMeta = await PageModule.generateMetadata({ params, searchParams }, metadata);
                            metadata = { ...metadata, ...dynamicMeta };
                        }
                        const { generateMetadataHtml } = require('../metadata/generate');
                        metadataHtml = metadata ? generateMetadataHtml(metadata) : '';
                    }
                    // Render the page via Flight stream → SSR
                    await renderFlightToHTMLStream(upstreamOrigin, req.path, req.query ? new URLSearchParams(req.query).toString() : '', metadataHtml, findChunkFiles(cwd, isDev), rootLayout.mode, flightSSRClient, ssrManifest, res, isDev);
                    return;
                }
                catch (flightError) {
                    if (flightError?.name === 'NotFoundError' && !res.headersSent) {
                        try {
                            const rootLayout = (0, root_resolver_1.resolveRootLayout)(runtimeRoot, isDev);
                            const route = currentRoute;
                            if (route) {
                                const segmentNotFoundPath = (0, app_router_runtime_1.resolveNearestSegmentNotFoundPath)(path_1.default.join(runtimeRoot, 'app'), route.routeDir);
                                if (segmentNotFoundPath) {
                                    const params = extractParams(req.path, route);
                                    const searchParams = Object.fromEntries(new URLSearchParams(req.query).entries());
                                    const notFoundResult = await createRouteElement({
                                        ...route,
                                        pagePath: segmentNotFoundPath,
                                    }, { params, searchParams, req }, isDev, rootLayout, runtimeRoot, { disableParallelSlots: true });
                                    const html = (0, server_1.renderToString)(notFoundResult.element);
                                    const { generateMetadataHtml } = require('../metadata/generate');
                                    const metadataHtml = notFoundResult.metadata
                                        ? generateMetadataHtml(notFoundResult.metadata)
                                        : '';
                                    res
                                        .status(404)
                                        .type('text/html')
                                        .send(createHtmlDocument(html, metadataHtml, findChunkFiles(cwd, isDev), notFoundResult.rootMode));
                                    return;
                                }
                            }
                        }
                        catch (notFoundError) {
                            console.error('[vista:rsc] Failed to render segment not-found fallback:', notFoundError);
                        }
                    }
                    console.error('[vista:rsc] Flight SSR failed:', flightError.message);
                    // If headers haven't been sent yet, show the error overlay directly.
                    // This is much better than falling through to legacy renderToString,
                    // which will likely hit the same error (e.g. useState in a server component).
                    if (isDev && !res.headersSent) {
                        const errorInfo = {
                            type: 'runtime',
                            message: flightError.message || 'Flight SSR Error',
                            stack: flightError.stack,
                        };
                        res.status(500).send((0, dev_error_1.renderErrorHTML)([errorInfo]));
                        return;
                    }
                    // If headers were already sent (stream was partially flushed),
                    // we can't change the status code, but we can inject an error
                    // overlay script at the end of the stream.
                    if (isDev && res.headersSent) {
                        try {
                            const errMsg = (flightError.message || 'Flight SSR Error')
                                .replace(/'/g, "\\'")
                                .replace(/\n/g, '\\n');
                            res.write(`<script>document.body.innerHTML='';document.body.style.background='#1a1a2e';document.body.style.color='#ff6b6b';document.body.style.fontFamily='monospace';document.body.style.padding='40px';document.body.innerHTML='<h2 style="color:#ff6b6b">\\u26a0 Server Error</h2><pre style="white-space:pre-wrap;color:#ffa07a">${errMsg}</pre>';</script>`);
                            res.end();
                        }
                        catch {
                            res.end();
                        }
                        return;
                    }
                }
            }
            // ==================================================================
            // Legacy Fallback: Direct renderToString
            // ==================================================================
            // Used when Flight SSR is unavailable or fails. This path does NOT
            // go through the Flight protocol — it requires page modules directly
            // and renders them with renderToString (synchronous, no streaming).
            // ==================================================================
            try {
                // Check upstream availability for the legacy path
                await withTimeout(`${upstreamOrigin}/rsc/`, { headers: { Accept: 'text/x-component' } }, 3000);
            }
            catch (error) {
                res.status(503).type('text/plain').send(getUpstreamUnavailableMessage());
                return;
            }
            try {
                const rootLayout = (0, root_resolver_1.resolveRootLayout)(runtimeRoot, isDev);
                const route = currentRoute;
                (0, request_context_1.setCurrentSegmentConfig)(route?.segmentConfig);
                if (!route) {
                    const resolvedNotFound = (0, root_resolver_1.resolveNotFoundComponent)(runtimeRoot, rootLayout, isDev);
                    if (resolvedNotFound) {
                        const notFoundElement = react_1.default.createElement(resolvedNotFound.component, {
                            params: {},
                            searchParams: {},
                        });
                        const wrapped = react_1.default.createElement(rootLayout.component, { params: {}, searchParams: {} }, notFoundElement);
                        const html = (0, server_1.renderToString)(wrapped);
                        res
                            .status(404)
                            .type('text/html')
                            .send(createHtmlDocument(html, '', findChunkFiles(cwd, isDev), rootLayout.mode));
                        return;
                    }
                    res.status(404).type('text/html').send((0, not_found_page_1.getStyledNotFoundHTML)());
                    return;
                }
                const params = extractParams(req.path, route);
                const searchParams = Object.fromEntries(new URLSearchParams(req.query).entries());
                const { element, metadata, rootMode } = await createRouteElement(route, { params, searchParams, req }, isDev, rootLayout, runtimeRoot);
                const appHtml = (0, server_1.renderToString)(element);
                const { generateMetadataHtml } = require('../metadata/generate');
                const metadataHtml = metadata ? generateMetadataHtml(metadata) : '';
                res
                    .status(200)
                    .type('text/html')
                    .send(createHtmlDocument(appHtml, metadataHtml, findChunkFiles(cwd, isDev), rootMode));
            }
            catch (error) {
                if (error?.name === 'NotFoundError') {
                    try {
                        const rootLayout = (0, root_resolver_1.resolveRootLayout)(runtimeRoot, isDev);
                        const route = currentRoute;
                        (0, request_context_1.setCurrentSegmentConfig)(route?.segmentConfig);
                        if (route) {
                            const segmentNotFoundPath = (0, app_router_runtime_1.resolveNearestSegmentNotFoundPath)(path_1.default.join(runtimeRoot, 'app'), route.routeDir);
                            if (segmentNotFoundPath) {
                                const params = extractParams(req.path, route);
                                const searchParams = Object.fromEntries(new URLSearchParams(req.query).entries());
                                const notFoundResult = await createRouteElement({
                                    ...route,
                                    pagePath: segmentNotFoundPath,
                                }, { params, searchParams, req }, isDev, rootLayout, runtimeRoot, { disableParallelSlots: true });
                                const html = (0, server_1.renderToString)(notFoundResult.element);
                                const { generateMetadataHtml } = require('../metadata/generate');
                                const metadataHtml = notFoundResult.metadata
                                    ? generateMetadataHtml(notFoundResult.metadata)
                                    : '';
                                res
                                    .status(404)
                                    .type('text/html')
                                    .send(createHtmlDocument(html, metadataHtml, findChunkFiles(cwd, isDev), notFoundResult.rootMode));
                                return;
                            }
                        }
                        const resolvedNotFound = (0, root_resolver_1.resolveNotFoundComponent)(runtimeRoot, rootLayout, isDev);
                        if (resolvedNotFound) {
                            const notFoundElement = react_1.default.createElement(resolvedNotFound.component, {
                                params: {},
                                searchParams: {},
                            });
                            const wrapped = react_1.default.createElement(rootLayout.component, { params: {}, searchParams: {} }, notFoundElement);
                            const html = (0, server_1.renderToString)(wrapped);
                            res
                                .status(404)
                                .type('text/html')
                                .send(createHtmlDocument(html, '', findChunkFiles(cwd, isDev), rootLayout.mode));
                            return;
                        }
                        res.status(404).type('text/html').send((0, not_found_page_1.getStyledNotFoundHTML)());
                        return;
                    }
                    catch (notFoundError) {
                        console.error('[vista:rsc] Failed to render NotFoundError fallback:', notFoundError);
                    }
                }
                console.error('[vista:rsc] Render error:', error);
                if (isDev) {
                    const errorInfo = {
                        type: 'runtime',
                        message: error.message || 'Unknown Server Error',
                        stack: error.stack,
                    };
                    res.status(500).send((0, dev_error_1.renderErrorHTML)([errorInfo]));
                }
                else {
                    res.status(500).send('<h1>Internal Server Error</h1>');
                }
            }
        });
    });
    const server = app.listen(port, () => {
        (0, logger_1.printServerReady)({ port, mode: 'rsc', rscFlight: useFlightSSR });
    });
    httpServer = server;
    server.on('error', (error) => {
        if (error?.code === 'EADDRINUSE') {
            (0, logger_1.logError)(`Port ${port} is already in use.`);
            process.exit(1);
            return;
        }
        (0, logger_1.logError)(`RSC startup failed: ${error?.message || String(error)}`);
        process.exit(1);
    });
}
