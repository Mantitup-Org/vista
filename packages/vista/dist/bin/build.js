"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compiler = void 0;
exports.buildClient = buildClient;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const webpack_1 = __importDefault(require("webpack"));
const webpack_config_1 = require("./webpack.config");
const file_scanner_1 = require("./file-scanner");
const manifest_1 = require("../build/manifest");
const config_1 = require("../config");
const constants_1 = require("../constants");
const structure_validator_1 = require("../server/structure-validator");
const structure_log_1 = require("../server/structure-log");
const devtools_indicator_snippet_1 = require("./devtools-indicator-snippet");
const dev_error_overlay_snippet_1 = require("./dev-error-overlay-snippet");
const deploy_output_1 = require("./deploy-output");
const module_boundary_validator_1 = require("../server/module-boundary-validator");
const _debug = !!process.env.VISTA_DEBUG;
// Helper to run PostCSS
function runPostCSS(cwd, vistaDir) {
    const globalsCss = path_1.default.join(cwd, 'app/globals.css');
    if (fs_1.default.existsSync(globalsCss)) {
        if (_debug)
            console.log('Building CSS with PostCSS...');
        const { execSync } = require('child_process');
        try {
            const cssOut = path_1.default.join(vistaDir, 'client.css');
            execSync(`npx postcss app/globals.css -o "${cssOut}"`, {
                stdio: _debug ? 'inherit' : 'pipe',
                cwd,
            });
            if (_debug)
                console.log('CSS Built Successfully!');
        }
        catch (cssErr) {
            console.error('CSS Build failed (PostCSS error).');
        }
    }
}
function collectRouteArtifactEntries(node, segments = [], entries = []) {
    const nextSegments = [...segments];
    if (node.segment) {
        if (node.kind === 'dynamic') {
            nextSegments.push(`:${node.segment}`);
        }
        else if (node.kind === 'catch-all') {
            nextSegments.push(`:${node.segment}*`);
        }
        else if (node.kind !== 'group') {
            nextSegments.push(node.segment);
        }
    }
    if (node.indexPath) {
        const pattern = nextSegments.length === 0 ? '/' : `/${nextSegments.join('/')}`;
        const type = pattern.includes('*')
            ? 'catch-all'
            : pattern.includes(':')
                ? 'dynamic'
                : 'static';
        entries.push({
            pattern,
            pagePath: String(node.indexPath),
            type,
        });
    }
    if (Array.isArray(node.children)) {
        node.children.forEach((child) => collectRouteArtifactEntries(child, nextSegments, entries));
    }
    return entries;
}
// Generate Client Entry File - TRUE RSC
// Only imports components with 'use client' directive
function generateClientEntry(cwd, vistaDir, clientComponents, isDev = false) {
    const devToolsBootId = `legacy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const appDir = path_1.default.join(cwd, 'app');
    // Generate imports ONLY for client components
    const clientImports = [];
    const clientRegistrations = [];
    clientComponents.forEach((comp, index) => {
        const relativePath = './' + path_1.default.relative(vistaDir, comp.absolutePath).replace(/\\/g, '/');
        const componentName = `ClientComponent_${index}`;
        const componentId = comp.relativePath.replace(/\\/g, '/').replace(/\.(tsx|ts|jsx|js)$/, '');
        // Extract just the component name (e.g., "Navbar" from "components/Navbar")
        const baseName = path_1.default.basename(comp.relativePath).replace(/\.(tsx|ts|jsx|js)$/, '');
        const lowercaseName = baseName.toLowerCase();
        clientImports.push(`import ${componentName} from "${relativePath}";`);
        // Register by full path (for standard RSC)
        clientRegistrations.push(`  "${componentId}": ${componentName},`);
        // Also register by lowercase name (for <Client> wrapper compatibility)
        clientRegistrations.push(`  "${lowercaseName}": ${componentName},`);
    });
    // Get Route Tree from Rust (but DON'T bundle server components)
    const { getRouteTree } = require('./file-scanner');
    let routeTree;
    try {
        routeTree = getRouteTree(appDir);
    }
    catch (e) {
        console.error('Failed to generate route tree:', e);
        process.exit(1);
    }
    // For RSC, we only serialize the STRUCTURE, not the components
    // Components are loaded separately
    function serializeRouteStructure(node) {
        const props = [];
        props.push(`segment: "${node.segment}"`);
        props.push(`kind: "${node.kind}"`);
        // Store paths as strings, NOT require() - server renders these
        if (node.indexPath) {
            const componentId = path_1.default
                .relative(appDir, node.indexPath)
                .replace(/\\/g, '/')
                .replace(/\.(tsx|ts|jsx|js)$/, '');
            props.push(`indexId: "${componentId}"`);
        }
        if (node.layoutPath) {
            const componentId = path_1.default
                .relative(appDir, node.layoutPath)
                .replace(/\\/g, '/')
                .replace(/\.(tsx|ts|jsx|js)$/, '');
            props.push(`layoutId: "${componentId}"`);
        }
        if (node.loadingPath) {
            const componentId = path_1.default
                .relative(appDir, node.loadingPath)
                .replace(/\\/g, '/')
                .replace(/\.(tsx|ts|jsx|js)$/, '');
            props.push(`loadingId: "${componentId}"`);
        }
        if (node.children && node.children.length > 0) {
            const childrenStr = node.children
                .map((child) => serializeRouteStructure(child))
                .join(',\n');
            props.push(`children: [\n${childrenStr}\n]`);
        }
        else {
            props.push(`children: []`);
        }
        return `{\n${props.join(',\n')}\n}`;
    }
    const routeStructure = serializeRouteStructure(routeTree);
    // TRUE RSC CLIENT ENTRY
    // Only client components are imported here
    const clientEntryContent = `
// Vista Client Entry - TRUE RSC
// Only client components are bundled here
import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';

// CLIENT COMPONENTS ONLY (marked with 'use client')
${clientImports.join('\n')}

// Register client components for selective hydration
const CLIENT_COMPONENTS: Record<string, React.ComponentType<any>> = {
${clientRegistrations.join('\n')}
};

// Route structure (NO server component code included)
const routeStructure = ${routeStructure};

// Selective Hydration - Only hydrate client component "islands"
function hydrateClientIslands() {
    const islands = document.querySelectorAll('[data-vista-client]');
    
    if (islands.length === 0) {
        // No client islands, but we still need to hydrate for routing
        const root = document.getElementById('root');
        if (root && root.hasChildNodes()) {
            console.log('[Vista RSC] Server-rendered content, minimal client JS loaded');
        }
        return;
    }
    
    console.log(\`[Vista RSC] Hydrating \${islands.length} client component(s)\`);
    
    islands.forEach((island) => {
        const componentId = island.getAttribute('data-vista-client');
        const propsJson = island.getAttribute('data-props') || '{}';
        
        if (componentId && CLIENT_COMPONENTS[componentId]) {
            const Component = CLIENT_COMPONENTS[componentId];
            const props = JSON.parse(propsJson);
            
            // Hydrate this island
            hydrateRoot(island as HTMLElement, React.createElement(Component, props));
            island.removeAttribute('data-vista-client');
            island.setAttribute('data-hydrated', 'true');
        }
    });
}

// Run hydration
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateClientIslands);
} else {
    hydrateClientIslands();
}

// Hot Module Replacement (HMR) Support
if ((module as any).hot) {
    (module as any).hot.accept();
}

// Server-Side Live Reload (for server component changes)
${isDev
        ? `
${(0, devtools_indicator_snippet_1.getDevToolsIndicatorBootstrapSource)(devToolsBootId)}
${(0, dev_error_overlay_snippet_1.getDevErrorOverlayBootstrapSource)()}

const sse = new EventSource('${constants_1.SSE_ENDPOINT}');
sse.onmessage = (event) => {
    if (event.data === 'reload') {
        const errorOverlay = window.__VISTA_DEV_ERROR_OVERLAY__;
        if (errorOverlay && typeof errorOverlay.clear === 'function') {
            errorOverlay.clear();
        }
        console.log('[Vista] Server component changed, reloading...');
        const indicator = window.__VISTA_DEVTOOLS_INDICATOR__;
        if (indicator && typeof indicator.pulse === 'function') {
            indicator.pulse('hmr', 460);
        }
        setTimeout(() => window.location.reload(), 80);
        return;
    }
    
    try {
        const data = JSON.parse(event.data);
        if (data.type === 'error' || data.type === 'structure-error') {
            const errorOverlay = window.__VISTA_DEV_ERROR_OVERLAY__;
            if (errorOverlay && typeof errorOverlay.show === 'function') {
                errorOverlay.show(data.errors || data.message);
            }
        } else if (data.type === 'ok' || data.type === 'structure-ok') {
            const errorOverlay = window.__VISTA_DEV_ERROR_OVERLAY__;
            if (errorOverlay && typeof errorOverlay.clear === 'function') {
                errorOverlay.clear();
            }
        }
    } catch (e) {
        // Ignore JSON parse errors for non-JSON messages
    }
};

sse.onerror = (e) => {
    console.log('[Vista] SSE connection lost');
};
`
        : '// SSE reload disabled in production'}

// Export for debugging
(window as any).${constants_1.CLIENT_COMPONENTS_FLAG} = CLIENT_COMPONENTS;
    `;
    fs_1.default.writeFileSync(path_1.default.join(vistaDir, 'client.tsx'), clientEntryContent);
    if (_debug) {
        console.log(`[Vista JS RSC] Generated client entry with ${clientComponents.length} client component(s)`);
    }
}
// Webpack Compiler Instance (reused for watch mode)
let compiler = null;
exports.compiler = compiler;
async function buildClient(watch = false, onRebuild) {
    const cwd = process.cwd();
    const vistaDirs = (0, manifest_1.createVistaDirectories)(cwd);
    const vistaDir = vistaDirs.root;
    const buildId = (0, manifest_1.getBuildId)(vistaDir, !watch);
    if (_debug)
        console.log(`Building Client (Watch Mode: ${watch}, Bundler: Webpack + SWC)...`);
    // ========================================================================
    // Pre-build Structure Validation
    // ========================================================================
    const vistaConfig = (0, config_1.loadConfig)(cwd);
    const engineVariant = (0, config_1.resolveAndApplyEngineVariant)(vistaConfig);
    const structureConfig = (0, config_1.resolveStructureValidationConfig)(vistaConfig);
    const cacheComponentsConfig = (0, config_1.resolveCacheComponentsConfig)(vistaConfig);
    if (_debug)
        console.log(`[vista:build] Engine variant: ${engineVariant}`);
    if (structureConfig.enabled) {
        const result = (0, structure_validator_1.validateAppStructure)({ cwd });
        (0, structure_log_1.logValidationResult)(result, structureConfig.logLevel);
        if (result.state === 'error' && structureConfig.mode === 'strict') {
            console.error((0, structure_log_1.formatBuildFailTable)(result));
            process.exit(1);
        }
        // Warnings: continue build, already logged above.
    }
    // Scan app directory using Rust bindings to get client components
    const appDir = path_1.default.join(cwd, 'app');
    const componentsDir = path_1.default.join(cwd, 'components');
    let clientComponents = [];
    if (fs_1.default.existsSync(appDir)) {
        if (_debug) {
            console.log(`[Vista JS] Using ${(0, file_scanner_1.isNativeAvailable)() ? 'Rust native' : 'JS fallback'} scanner (v${(0, file_scanner_1.getVersion)()})`);
        }
        const scanResult = (0, file_scanner_1.scanAppDirectory)(appDir);
        if (_debug) {
            console.log(`[Vista JS] Found ${scanResult.clientComponents.length} client components, ${scanResult.serverComponents.length} server components in app/`);
        }
        // Store client components for entry generation
        clientComponents = scanResult.clientComponents.map((c) => ({
            relativePath: c.relativePath,
            absolutePath: c.absolutePath,
        }));
        // Log client components
        if (scanResult.clientComponents.length > 0 && _debug) {
            console.log(`[Vista JS] Client components ('use client') from app/:`);
            scanResult.clientComponents.forEach((c) => {
                console.log(`  - ${c.relativePath}`);
            });
        }
        const moduleBoundaryIssues = (0, module_boundary_validator_1.validateModuleBoundaries)({
            appDir,
            extraRoots: fs_1.default.existsSync(componentsDir) ? [componentsDir] : [],
            cacheComponentsEnabled: cacheComponentsConfig.enabled,
        }).issues;
        if (moduleBoundaryIssues.length > 0) {
            console.log('');
            console.log('\x1b[41m\x1b[37m ERROR \x1b[0m \x1b[31mServer/Segment Validation Error\x1b[0m');
            console.log('');
            for (const issue of moduleBoundaryIssues) {
                console.log(`\x1b[31m✗\x1b[0m ${path_1.default.relative(cwd, issue.filePath)}`);
                console.log(`  ${issue.message}`);
                console.log('');
                if (issue.fix) {
                    console.log(`  \x1b[36mTo fix:\x1b[0m ${issue.fix}`);
                    console.log('');
                }
            }
            if (!watch) {
                console.log('\x1b[31mBuild failed due to server/segment violations.\x1b[0m');
                process.exit(1);
            }
        }
    }
    // Also scan components directory (outside app folder) for client components
    if (fs_1.default.existsSync(componentsDir)) {
        if (_debug)
            console.log(`[Vista JS] Scanning components/ directory...`);
        const componentsScanResult = (0, file_scanner_1.scanAppDirectory)(componentsDir);
        // Map relativePath to include 'components/' prefix for proper resolution
        const componentsClientList = componentsScanResult.clientComponents.map((c) => ({
            relativePath: 'components/' + c.relativePath,
            absolutePath: c.absolutePath,
        }));
        clientComponents = [...clientComponents, ...componentsClientList];
        if (componentsScanResult.clientComponents.length > 0 && _debug) {
            console.log(`[Vista JS] Client components ('use client') from components/:`);
            componentsScanResult.clientComponents.forEach((c) => {
                console.log(`  - components/${c.relativePath}`);
            });
        }
    }
    if (_debug)
        console.log(`[Vista JS] Total client components: ${clientComponents.length}`);
    // Write canonical artifact manifests for legacy mode.
    try {
        const { getRouteTree } = require('./file-scanner');
        const { discoverRouteHandlers } = require('../server/route-handler-registry');
        const routeTree = getRouteTree(appDir);
        const routes = collectRouteArtifactEntries(routeTree);
        const routeHandlers = discoverRouteHandlers(appDir);
        (0, manifest_1.writeCanonicalVistaArtifacts)(cwd, vistaDir, buildId, routes, routeHandlers);
    }
    catch (error) {
        // Keep build behavior resilient in environments where route scan fails.
        (0, manifest_1.writeCanonicalVistaArtifacts)(cwd, vistaDir, buildId, []);
        console.warn(`[vista:build] Failed to derive route artifacts: ${error.message}`);
    }
    (0, manifest_1.writeReservedVistaArtifacts)(vistaDir, {
        buildId,
        engineVariant,
        imagesConfig: vistaConfig.images,
    });
    // Generate client entry - TRUE RSC: only client components
    generateClientEntry(cwd, vistaDir, clientComponents, watch);
    // Create Webpack config
    const config = (0, webpack_config_1.createWebpackConfig)({
        cwd,
        isDev: watch,
        engineVariant,
        cacheComponentsEnabled: cacheComponentsConfig.enabled,
    });
    // Create Webpack compiler
    exports.compiler = compiler = (0, webpack_1.default)(config);
    if (watch) {
        // In watch mode, we return the compiler for use with dev middleware
        // Initial CSS build
        runPostCSS(cwd, vistaDir);
        // Watch CSS + source files that may affect Tailwind output.
        const chokidar = require('chokidar');
        try {
            const styleWatchRoots = ['app', 'components', 'content', 'lib', 'ctx', 'data']
                .map((entry) => path_1.default.join(cwd, entry))
                .filter((entry) => fs_1.default.existsSync(entry));
            let cssTimer = null;
            const scheduleCSSBuild = () => {
                if (cssTimer)
                    clearTimeout(cssTimer);
                cssTimer = setTimeout(() => {
                    if (_debug)
                        console.log('Style source changed, rebuilding CSS...');
                    runPostCSS(cwd, vistaDir);
                }, 120);
            };
            chokidar
                .watch(styleWatchRoots, {
                ignoreInitial: true,
                ignored: (watchedPath) => watchedPath.includes(`${path_1.default.sep}node_modules${path_1.default.sep}`) ||
                    watchedPath.includes(`${path_1.default.sep}.git${path_1.default.sep}`) ||
                    watchedPath.includes(`${path_1.default.sep}.vista${path_1.default.sep}`),
            })
                .on('all', (_event, changedPath) => {
                if (/\.(?:css|[cm]?[jt]sx?|md|mdx)$/i.test(changedPath)) {
                    scheduleCSSBuild();
                }
            });
        }
        catch (e) {
            // chokidar not installed, skip CSS watch
        }
        if (_debug)
            console.log('Webpack compiler ready for dev middleware.');
        return compiler;
    }
    else {
        // Production build
        return new Promise((resolve, reject) => {
            compiler.run((err, stats) => {
                if (err) {
                    console.error('Webpack build error:', err);
                    reject(err);
                    return;
                }
                if (stats?.hasErrors()) {
                    console.error('Webpack compilation errors:', stats.toString('errors-only'));
                    reject(new Error('Compilation failed'));
                    return;
                }
                console.log('Webpack build complete!');
                console.log(stats?.toString('minimal'));
                // Build CSS
                runPostCSS(cwd, vistaDir);
                (0, deploy_output_1.generateDeploymentOutputs)({
                    cwd,
                    vistaDir,
                    debug: _debug,
                });
                (0, manifest_1.pruneEmptyVistaDirectories)(vistaDir);
                compiler.close((closeErr) => {
                    if (closeErr)
                        console.error('Error closing compiler:', closeErr);
                    resolve(null);
                });
            });
        });
    }
}
