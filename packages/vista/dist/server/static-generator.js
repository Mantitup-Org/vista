"use strict";
/**
 * Vista Static Generator
 *
 * Pre-renders pages at build time for SSG and ISR routes.
 * Works with both the RSC pipeline (Flight payloads) and
 * legacy SSR (renderToString).
 *
 * Called after webpack compilation completes in `buildRSC()`.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStaticPages = generateStaticPages;
exports.revalidatePath = revalidatePath;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const constants_1 = require("../constants");
const static_cache_1 = require("./static-cache");
const module_compile_hook_1 = require("./module-compile-hook");
const request_context_1 = require("./request-context");
const app_router_runtime_1 = require("./app-router-runtime");
const fetch_policy_1 = require("./fetch-policy");
const spawn_permissions_1 = require("./spawn-permissions");
const config_1 = require("../config");
const ppr_1 = require("./ppr");
const vista_import_map_1 = require("./vista-import-map");
const CjsModule = require('module');
let staticRuntimeReady = false;
let reactResolutionInstalled = false;
let originalResolveFilename = null;
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
function resolveVistaInternalRequest(request) {
    return (0, vista_import_map_1.resolveVistaSourceRequest)(request, path_1.default.resolve(__dirname, '..'));
}
function installSingleReactResolution(cwd) {
    if (reactResolutionInstalled)
        return;
    let reactPath;
    let reactDomPath;
    try {
        reactPath = require.resolve('react', { paths: [cwd] });
        reactDomPath = require.resolve('react-dom', { paths: [cwd] });
    }
    catch {
        try {
            reactPath = require.resolve('react');
            reactDomPath = require.resolve('react-dom');
        }
        catch {
            return;
        }
    }
    originalResolveFilename = CjsModule._resolveFilename;
    CjsModule._resolveFilename = function (request, parent, isMain, options) {
        const vistaResolvedPath = resolveVistaInternalRequest(request);
        if (vistaResolvedPath)
            return vistaResolvedPath;
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
    }
    catch {
        // no transpiler available
    }
}
function setupStaticGenerationRuntime(cwd) {
    if (staticRuntimeReady)
        return;
    // Ignore CSS imports while requiring app modules for prerender.
    require.extensions['.css'] = (m, filename) => {
        if (filename.endsWith('.module.css')) {
            m.exports = {};
        }
    };
    const cacheComponentsConfig = (0, config_1.resolveCacheComponentsConfig)((0, config_1.loadConfig)(cwd));
    installSingleReactResolution(cwd);
    setupTypeScriptRuntime(cwd);
    (0, module_compile_hook_1.installModuleCompileHook)({
        cwd,
        cacheComponentsEnabled: cacheComponentsConfig.enabled,
    });
    (0, fetch_policy_1.installSegmentFetchPolicyShim)();
    staticRuntimeReady = true;
}
// ---------------------------------------------------------------------------
// Static param expansion
// ---------------------------------------------------------------------------
/**
 * For dynamic routes with `generateStaticParams`, call the function
 * and return the list of param sets.
 */
async function resolveStaticParams(route, cwd) {
    setupStaticGenerationRuntime(cwd);
    if (!route.hasGenerateStaticParams) {
        return [];
    }
    try {
        // Bust require cache to get fresh module
        try {
            delete require.cache[require.resolve(route.pagePath)];
        }
        catch {
            // ignore
        }
        const pageModule = require(route.pagePath);
        const generateStaticParams = pageModule.generateStaticParams || pageModule.default?.generateStaticParams;
        if (typeof generateStaticParams !== 'function') {
            return [];
        }
        const params = await generateStaticParams();
        if (!Array.isArray(params)) {
            console.warn(`[vista:ssg] generateStaticParams for ${route.pattern} did not return an array`);
            return [];
        }
        return params;
    }
    catch (err) {
        console.error(`[vista:ssg] Error calling generateStaticParams for ${route.pattern}:`, err.message);
        return [];
    }
}
/**
 * Expand a route pattern with params to get a concrete URL.
 * e.g., '/blog/:slug' + { slug: 'hello' } → '/blog/hello'
 */
function expandPattern(pattern, params) {
    let url = pattern;
    for (const [key, value] of Object.entries(params)) {
        const param = Array.isArray(value) ? value.join('/') : value;
        // Handle catch-all :param* and optional catch-all :param*?
        url = url.replace(new RegExp(`:${key}\\*\\??`), param);
        // Handle regular :param
        url = url.replace(`:${key}`, param);
    }
    return url;
}
// ---------------------------------------------------------------------------
// Page pre-rendering
// ---------------------------------------------------------------------------
/**
 * Pre-render a single page.
 * Loads the page component and renders it to HTML.
 *
 * This is a simplified renderer that works with the compiled webpack
 * server bundle. For RSC mode, the actual Flight prerendering is
 * handled by the upstream process.
 */
async function prerenderPage(urlPath, route, params, cwd, vistaDirRoot, appPprEnabled) {
    setupStaticGenerationRuntime(cwd);
    return (0, request_context_1.runWithRequestContext)({
        cwd,
        vistaDirRoot,
        urlPath,
        segmentConfig: route.segmentConfig,
    }, async () => {
        try {
            const React = require('react');
            const { renderToString } = require('react-dom/server');
            const isAsyncComponent = (component) => {
                return (typeof component === 'function' &&
                    component.constructor &&
                    component.constructor.name === 'AsyncFunction');
            };
            const renderComponent = async (component, props, child) => {
                if (isAsyncComponent(component)) {
                    const asyncProps = child === undefined ? props : { ...props, children: child };
                    return component(asyncProps);
                }
                if (child === undefined) {
                    return React.createElement(component, props);
                }
                return React.createElement(component, props, child);
            };
            const renderStaticSubtree = async (input) => {
                const appDir = path_1.default.join(cwd, 'app');
                const RouteModule = require(input.entryFilePath);
                const RouteComponent = RouteModule.default;
                if (!RouteComponent) {
                    throw new Error(`Route module does not export default component: ${input.entryFilePath}`);
                }
                let subtree = await renderComponent(RouteComponent, {
                    params: input.params,
                    searchParams: input.searchParams,
                });
                const directoryChain = (0, app_router_runtime_1.resolveDirectoryChain)(input.subtreeRootDir, input.entryFilePath);
                for (let i = directoryChain.length - 1; i >= 0; i--) {
                    const dir = directoryChain[i];
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
                            slotProps[slotMatch.slotName] = await renderStaticSubtree({
                                subtreeRootDir: slotMatch.slotRootDir,
                                entryFilePath: slotMatch.filePath,
                                pathname: input.pathname,
                                params: {
                                    ...input.params,
                                    ...slotMatch.params,
                                },
                                searchParams: input.searchParams,
                            });
                        }
                    }
                    subtree = await renderComponent(LayoutComponent, {
                        params: input.params,
                        searchParams: input.searchParams,
                        ...slotProps,
                    }, subtree);
                }
                return subtree;
            };
            // Load page component from webpack-built server bundle
            const pageModule = require(route.pagePath);
            const PageComponent = pageModule.default;
            if (!PageComponent) {
                console.warn(`[vista:ssg] No default export in ${route.pagePath}`);
                return null;
            }
            let metadata = {};
            const searchParams = {};
            for (const layoutPath of route.layoutPaths) {
                try {
                    const layoutModule = require(layoutPath);
                    if (layoutModule?.metadata && typeof layoutModule.metadata === 'object') {
                        metadata = { ...metadata, ...layoutModule.metadata };
                    }
                }
                catch {
                    // Ignore layout metadata failures for static generation.
                }
            }
            if (pageModule.metadata && typeof pageModule.metadata === 'object') {
                metadata = { ...metadata, ...pageModule.metadata };
            }
            if (typeof pageModule.generateMetadata === 'function') {
                try {
                    const dynamicMeta = await pageModule.generateMetadata({ params: params || {}, searchParams }, metadata);
                    if (dynamicMeta && typeof dynamicMeta === 'object') {
                        metadata = { ...metadata, ...dynamicMeta };
                    }
                }
                catch (metadataError) {
                    console.warn(`[vista:ssg] generateMetadata failed for ${urlPath}:`, metadataError?.message || String(metadataError));
                }
            }
            let metadataHtml = '';
            try {
                const { generateMetadataHtml } = require('../metadata/generate');
                metadataHtml = generateMetadataHtml(metadata);
            }
            catch {
                metadataHtml = '';
            }
            const element = await renderStaticSubtree({
                subtreeRootDir: path_1.default.join(cwd, 'app'),
                entryFilePath: route.pagePath,
                pathname: urlPath,
                params: params || {},
                searchParams,
            });
            const pprEnabled = (0, ppr_1.isRoutePPREligible)(route, appPprEnabled);
            let shellHtml;
            let pprInfo = undefined;
            if (pprEnabled && route.loadingPath) {
                try {
                    const shellElement = await renderStaticSubtree({
                        subtreeRootDir: path_1.default.join(cwd, 'app'),
                        entryFilePath: route.loadingPath,
                        pathname: urlPath,
                        params: params || {},
                        searchParams,
                    });
                    const renderedShellHtml = renderToString(shellElement);
                    shellHtml = (0, ppr_1.injectPprResumeBootstrap)(wrapInDocument(`${renderedShellHtml}\n<!--vista:ppr-shell-->`, urlPath, metadataHtml, cwd), urlPath);
                    pprInfo = (0, ppr_1.createPartialPrerenderInfo)(urlPath);
                }
                catch (shellError) {
                    console.warn(`[vista:ppr] Failed to generate shell for ${urlPath}:`, shellError?.message || String(shellError));
                }
            }
            // Render to HTML string
            const html = renderToString(element);
            return {
                html: wrapInDocument(html, urlPath, metadataHtml, cwd),
                shellHtml,
                generatedAt: Date.now(),
                revalidate: route.revalidate || 0,
                routePattern: route.pattern,
                params,
                tags: (0, request_context_1.consumeTrackedTags)(),
                ppr: pprInfo,
            };
        }
        catch (err) {
            console.error(`[vista:ssg] Error pre-rendering ${urlPath}:`, err?.message || String(err));
            return null;
        }
    });
}
/**
 * Wrap rendered HTML in a basic document shell.
 */
function injectBeforeClosingTag(html, tagName, injection) {
    const closeTag = `</${tagName}>`;
    if (html.includes(closeTag)) {
        return html.replace(closeTag, `${injection}\n${closeTag}`);
    }
    return html;
}
function getCSSLinks(cwd) {
    const links = ['<link rel="stylesheet" href="/styles.css" />'];
    const chunksDir = path_1.default.join(cwd, constants_1.BUILD_DIR, 'static', 'chunks');
    try {
        if (fs_1.default.existsSync(chunksDir)) {
            const files = fs_1.default.readdirSync(chunksDir).filter((entry) => entry.endsWith('.css'));
            for (const file of files) {
                links.push(`<link rel="stylesheet" href="${constants_1.STATIC_CHUNKS_PATH}${file}" />`);
            }
        }
    }
    catch {
        // Ignore CSS discovery failures during static generation.
    }
    return links.join('\n  ');
}
function getChunkScripts(cwd) {
    const chunksDir = path_1.default.join(cwd, constants_1.BUILD_DIR, 'static', 'chunks');
    try {
        if (!fs_1.default.existsSync(chunksDir)) {
            return '';
        }
        const files = fs_1.default
            .readdirSync(chunksDir)
            .filter((entry) => entry.endsWith('.js') && !entry.endsWith('.map') && !entry.includes('.hot-update.'));
        const priority = ['webpack.js', 'framework.js', 'vendor.js'];
        files.sort((a, b) => {
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
        return files
            .map((file) => `<script defer src="${constants_1.STATIC_CHUNKS_PATH}${file}"></script>`)
            .join('\n  ');
    }
    catch {
        // Ignore chunk discovery failures during static generation.
        return '';
    }
}
function resolveUpstreamScriptPath() {
    const jsPath = path_1.default.join(__dirname, 'rsc-upstream.js');
    if (fs_1.default.existsSync(jsPath)) {
        return jsPath;
    }
    const tsPath = path_1.default.join(__dirname, 'rsc-upstream.ts');
    if (fs_1.default.existsSync(tsPath)) {
        return tsPath;
    }
    return null;
}
function waitForUpstreamReady(child, timeoutMs) {
    return new Promise((resolve, reject) => {
        let logs = '';
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`[vista:ssg] Timed out waiting for RSC upstream readiness (${timeoutMs}ms)\n${logs}`));
        }, timeoutMs);
        const cleanup = () => {
            clearTimeout(timer);
            child.stdout.removeListener('data', onData);
            child.stderr.removeListener('data', onData);
            child.removeListener('exit', onExit);
            child.removeListener('error', onError);
        };
        const onData = (chunk) => {
            logs += chunk.toString();
            if (logs.includes('Listening on')) {
                cleanup();
                resolve();
            }
        };
        const onExit = (code) => {
            cleanup();
            reject(new Error(`[vista:ssg] RSC upstream exited before readiness (code: ${code ?? 'unknown'})`));
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.once('exit', onExit);
        child.once('error', onError);
    });
}
async function startStaticFlightUpstream(cwd) {
    const upstreamScript = resolveUpstreamScriptPath();
    if (!upstreamScript) {
        return null;
    }
    const port = Number(process.env.VISTA_STATIC_RSC_PORT || 3181);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return null;
    }
    let child;
    try {
        child = (0, child_process_1.spawn)(process.execPath, ['--conditions', 'react-server', upstreamScript, '--port', String(port)], {
            cwd,
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV || 'production',
                RSC_UPSTREAM_PORT: String(port),
            },
            stdio: 'pipe',
        });
    }
    catch (spawnError) {
        if ((0, spawn_permissions_1.isPermissionDeniedSpawnError)(spawnError)) {
            return null;
        }
        throw spawnError;
    }
    try {
        await waitForUpstreamReady(child, 12000);
    }
    catch (startupError) {
        if ((0, spawn_permissions_1.isPermissionDeniedSpawnError)(startupError)) {
            try {
                if (!child.killed) {
                    child.kill();
                }
            }
            catch {
                // ignore cleanup failures
            }
            return null;
        }
        throw startupError;
    }
    const close = async () => {
        if (child.killed)
            return;
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                }
                catch {
                    // ignore force-kill failures
                }
            }, 2500);
            child.once('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
            try {
                child.kill();
            }
            catch {
                clearTimeout(timeout);
                resolve();
            }
        });
    };
    return {
        async fetchFlight(urlPath) {
            const normalizedPath = urlPath === '/' ? '' : urlPath;
            const flightUrl = `http://127.0.0.1:${port}/rsc${normalizedPath}`;
            try {
                const response = await fetch(flightUrl, {
                    headers: { Accept: 'text/x-component' },
                });
                if (!response.ok) {
                    return undefined;
                }
                return await response.text();
            }
            catch {
                return undefined;
            }
        },
        close,
    };
}
function wrapInDocument(bodyHtml, _urlPath, metadataHtml, cwd) {
    const headInjection = `\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  ${metadataHtml}\n  ${getCSSLinks(cwd)}`;
    const scripts = getChunkScripts(cwd);
    const hasDocumentMarkup = /<html(?:\s|>)/i.test(bodyHtml) && /<\/html>/i.test(bodyHtml);
    if (hasDocumentMarkup) {
        const htmlStart = bodyHtml.search(/<html(?:\s|>)/i);
        let html = htmlStart > 0 ? bodyHtml.slice(htmlStart) : bodyHtml;
        if (!/^\s*<!doctype html>/i.test(html)) {
            html = `<!DOCTYPE html>\n${html}`;
        }
        html = injectBeforeClosingTag(html, 'head', headInjection);
        const bodyInjection = `\n  <script>window.${constants_1.HYDRATE_DOCUMENT_FLAG} = true;</script>\n  ${scripts}`;
        html = injectBeforeClosingTag(html, 'body', bodyInjection);
        return html;
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
  ${headInjection}
</head>
<body>
  <script>window.${constants_1.HYDRATE_DOCUMENT_FLAG} = false;</script>
  <div id="root">${bodyHtml}</div>
  ${scripts}
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Run static generation for all eligible routes.
 */
async function generateStaticPages(options) {
    const { cwd, vistaDirRoot, manifest, isDev, buildId } = options;
    const vistaConfig = (0, config_1.loadConfig)(cwd);
    const appPprEnabled = (0, ppr_1.isAppPPREnabled)(vistaConfig);
    const result = {
        pagesGenerated: 0,
        generatedPaths: [],
        failedPaths: [],
        manifest: { routes: {}, dynamicRoutes: {}, notFoundRoutes: [] },
    };
    // In dev mode, skip prerendering (pages are rendered on demand)
    if (isDev) {
        result.manifest = (0, static_cache_1.generatePrerenderManifest)(manifest.routes, undefined, { appPprEnabled });
        return result;
    }
    const staticRoutes = manifest.routes.filter((r) => r.renderMode === 'static' || r.renderMode === 'isr');
    console.log(`[vista:ssg] Found ${staticRoutes.length} routes eligible for static generation`);
    let flightUpstream = null;
    try {
        flightUpstream = await startStaticFlightUpstream(cwd);
    }
    catch (flightError) {
        if ((0, spawn_permissions_1.isPermissionDeniedSpawnError)(flightError)) {
            console.log('[vista:ssg] Flight payload pre-generation skipped (spawn blocked by environment permissions)');
        }
        else {
            console.warn(`[vista:ssg] Flight payload pre-generation disabled: ${(0, spawn_permissions_1.getErrorMessage)(flightError)}`);
        }
    }
    try {
        for (const route of staticRoutes) {
            if (route.type === 'static') {
                // Simple static route — single URL
                const urlPath = route.pattern;
                const page = await prerenderPage(urlPath, route, undefined, cwd, vistaDirRoot, appPprEnabled);
                if (page) {
                    if (flightUpstream) {
                        const flightData = await flightUpstream.fetchFlight(urlPath);
                        if (flightData) {
                            page.flightData = flightData;
                        }
                    }
                    (0, static_cache_1.setCachedPage)(urlPath, page);
                    (0, static_cache_1.writeStaticPageToDisk)(vistaDirRoot, urlPath, page);
                    result.generatedPaths.push(urlPath);
                    result.pagesGenerated++;
                }
                else {
                    result.failedPaths.push({ path: urlPath, error: 'Prerender returned null' });
                }
            }
            else if (route.hasGenerateStaticParams) {
                // Dynamic route with generateStaticParams — expand to concrete URLs
                const paramSets = await resolveStaticParams(route, cwd);
                if (paramSets.length === 0) {
                    console.log(`[vista:ssg] No static params for ${route.pattern} — will render on demand`);
                    continue;
                }
                for (const params of paramSets) {
                    const urlPath = expandPattern(route.pattern, params);
                    const page = await prerenderPage(urlPath, route, params, cwd, vistaDirRoot, appPprEnabled);
                    if (page) {
                        if (flightUpstream) {
                            const flightData = await flightUpstream.fetchFlight(urlPath);
                            if (flightData) {
                                page.flightData = flightData;
                            }
                        }
                        (0, static_cache_1.setCachedPage)(urlPath, page);
                        (0, static_cache_1.writeStaticPageToDisk)(vistaDirRoot, urlPath, page);
                        result.generatedPaths.push(urlPath);
                        result.pagesGenerated++;
                    }
                    else {
                        result.failedPaths.push({ path: urlPath, error: 'Prerender returned null' });
                    }
                }
            }
        }
    }
    finally {
        if (flightUpstream) {
            await flightUpstream.close();
        }
    }
    // Generate prerender manifest
    result.manifest = (0, static_cache_1.generatePrerenderManifest)(manifest.routes, undefined, { appPprEnabled });
    // Write manifest to disk
    const manifestPath = path_1.default.join(vistaDirRoot, 'prerender-manifest.json');
    fs_1.default.writeFileSync(manifestPath, JSON.stringify(result.manifest, null, 2));
    console.log(`[vista:ssg] Generated ${result.pagesGenerated} static pages` +
        (result.failedPaths.length > 0 ? ` (${result.failedPaths.length} failed)` : ''));
    return result;
}
/**
 * Trigger ISR revalidation for a specific path.
 * Called at runtime when a stale page is requested.
 */
async function revalidatePath(urlPath, route, params, cwd, vistaDirRoot) {
    if ((0, static_cache_1.isRevalidating)(urlPath)) {
        return false; // Already being revalidated
    }
    (0, static_cache_1.markRevalidating)(urlPath);
    try {
        const page = await prerenderPage(urlPath, route, params, cwd, vistaDirRoot, (0, ppr_1.isAppPPREnabled)((0, config_1.loadConfig)(cwd)));
        if (page) {
            (0, static_cache_1.setCachedPage)(urlPath, page);
            (0, static_cache_1.writeStaticPageToDisk)(vistaDirRoot, urlPath, page);
            return true;
        }
        return false;
    }
    catch (err) {
        console.error(`[vista:isr] Revalidation failed for ${urlPath}:`, err?.message || String(err));
        return false;
    }
    finally {
        (0, static_cache_1.clearRevalidating)(urlPath);
    }
}
