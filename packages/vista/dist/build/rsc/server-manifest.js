"use strict";
/**
 * Server Component Manifest Generator
 *
 * Scans the app directory and builds a manifest of all Server Components.
 * Server components are all components WITHOUT 'use client' directive.
 *
 * Server components:
 * - Render on the server only
 * - Have access to server resources (DB, file system, env vars)
 * - Contribute 0kb to the client JavaScript bundle
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateServerManifest = generateServerManifest;
exports.getServerComponent = getServerComponent;
exports.isServerComponentPath = isServerComponentPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const component_identity_1 = require("./component-identity");
const constants_1 = require("../../constants");
const runtime_actions_1 = require("../../server/runtime-actions");
const route_handler_registry_1 = require("../../server/route-handler-registry");
const segment_config_1 = require("../../server/segment-config");
const RESERVED_INTERNAL_SEGMENTS = new Set(['[not-found]']);
function hasReservedInternalSegment(relativePath) {
    return relativePath
        .replace(/\\/g, '/')
        .split('/')
        .some((segment) => RESERVED_INTERNAL_SEGMENTS.has(segment));
}
// Try to load Rust NAPI bindings
let rustNative = null;
try {
    const possiblePaths = [
        path_1.default.resolve(__dirname, '../../../../../crates/vista-napi'),
        path_1.default.resolve(__dirname, '../../../../crates/vista-napi'),
    ];
    for (const p of possiblePaths) {
        try {
            rustNative = require(p);
            break;
        }
        catch (e) {
            // Try next
        }
    }
}
catch (e) {
    // Fallback to JS
}
/**
 * Check if source has 'use client' directive
 */
function hasClientDirective(source) {
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
    if (trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"')) {
        return true;
    }
    if (rustNative?.isClientComponent) {
        return rustNative.isClientComponent(source);
    }
    return false;
}
function hasServerDirective(source) {
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
    return trimmed.startsWith("'use server'") || trimmed.startsWith('"use server"');
}
function extractExports(source) {
    const exports = [];
    if (/export\s+default\s+/.test(source)) {
        exports.push('default');
    }
    const namedExportRegex = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
    let match;
    while ((match = namedExportRegex.exec(source)) !== null) {
        exports.push(match[1]);
    }
    const reExportRegex = /export\s+\{([^}]+)\}/g;
    while ((match = reExportRegex.exec(source)) !== null) {
        const names = match[1]
            .split(',')
            .map((entry) => entry
            .trim()
            .split(/\s+as\s+/)
            .pop()
            ?.trim())
            .filter(Boolean);
        exports.push(...names);
    }
    return [...new Set(exports)];
}
/**
 * Check for metadata exports
 */
function analyzeMetadata(source) {
    if (rustNative?.analyzeMetadata) {
        const result = rustNative.analyzeMetadata(source);
        return {
            hasMetadata: result.has_static_metadata,
            hasGenerateMetadata: result.has_generate_metadata,
        };
    }
    return {
        hasMetadata: /export\s+const\s+metadata\b/.test(source),
        hasGenerateMetadata: /export\s+(async\s+)?function\s+generateMetadata\b/.test(source),
    };
}
/**
 * Analyze route rendering configuration exports.
 *
 * Detects:
 *   export const dynamic = 'force-static' | 'force-dynamic' | 'auto' | 'error';
 *   export const revalidate = <number> | false;
 *   export async function generateStaticParams() { ... }
 */
function analyzeRenderConfig(source) {
    const parsedSegmentConfig = (0, segment_config_1.parseSegmentConfig)(source, '<inline>');
    let renderMode = 'auto';
    let revalidate;
    const hasGenerateStaticParams = /export\s+(async\s+)?function\s+generateStaticParams\b/.test(source);
    if (parsedSegmentConfig.config.dynamic === 'force-static' || parsedSegmentConfig.config.dynamic === 'error') {
        renderMode = 'static';
    }
    else if (parsedSegmentConfig.config.dynamic === 'force-dynamic') {
        renderMode = 'dynamic';
    }
    if (typeof parsedSegmentConfig.config.revalidate === 'number') {
        revalidate = parsedSegmentConfig.config.revalidate;
    }
    return {
        renderMode,
        revalidate,
        hasGenerateStaticParams,
        segmentConfig: parsedSegmentConfig.config,
    };
}
/**
 * Determine component type from file name
 */
function getComponentType(fileName) {
    const base = path_1.default.basename(fileName).replace(/\.[jt]sx?$/, '');
    switch (base) {
        case 'page':
        case 'index':
            return 'page';
        case 'layout':
        case 'root':
            return 'layout';
        case 'loading':
            return 'loading';
        case 'error':
            return 'error';
        case 'default':
            return 'default';
        case 'not-found':
            return 'not-found';
        default:
            return 'component';
    }
}
function isRouteGroupSegment(segment) {
    return segment.startsWith('(') && segment.endsWith(')');
}
function isParallelRouteSegment(segment) {
    return segment.startsWith('@');
}
function isInterceptionRouteSegment(segment) {
    return (segment.startsWith('(.)') ||
        segment.startsWith('(..)') ||
        segment.startsWith('(..)(..)') ||
        segment.startsWith('(...)'));
}
function hasNonPublicRouteSegment(relativePath) {
    return relativePath
        .replace(/\\/g, '/')
        .split('/')
        .some((segment) => isParallelRouteSegment(segment) || isInterceptionRouteSegment(segment));
}
/**
 * Extract client component imports from source
 */
function extractClientImports(source, appDir) {
    const imports = [];
    // Match import statements
    const importRegex = /import\s+(?:[\w\s{},*]+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(source)) !== null) {
        const importPath = match[1];
        // Skip node_modules
        if (!importPath.startsWith('.') && !importPath.startsWith('/'))
            continue;
        // This is a relative import - we'd need to resolve and check if it's a client component
        // For now, we'll mark it as a potential dependency
        imports.push(importPath);
    }
    return imports;
}
function analyzeServerActions(source, absolutePath) {
    const entries = [];
    if (hasServerDirective(source)) {
        for (const exportName of extractExports(source)) {
            entries.push({
                id: (0, runtime_actions_1.createExportServerReferenceId)(absolutePath, exportName),
                filePath: absolutePath,
                kind: 'module-export',
                exportName,
            });
        }
    }
    const inlineMatches = [];
    const declarationRegex = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*['"]use server['"]/g;
    const assignedRegex = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b[^{]*\{|\([^)]*\)\s*=>\s*\{|\w+\s*=>\s*\{)\s*['"]use server['"]/g;
    let match;
    while ((match = declarationRegex.exec(source)) !== null) {
        inlineMatches.push({ name: match[1], index: match.index });
    }
    while ((match = assignedRegex.exec(source)) !== null) {
        inlineMatches.push({ name: match[1], index: match.index });
    }
    inlineMatches
        .sort((a, b) => a.index - b.index)
        .forEach(({ name }, index) => {
        entries.push({
            id: (0, runtime_actions_1.createInlineServerActionId)(absolutePath, index, name),
            filePath: absolutePath,
            kind: 'inline',
            exportName: name,
        });
    });
    return entries;
}
/**
 * Scan directory recursively for server components
 */
function scanForServerComponents(dir, appDir, components) {
    if (!fs_1.default.existsSync(dir))
        return;
    const items = fs_1.default.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path_1.default.join(dir, item.name);
        if (item.isDirectory()) {
            if (!item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'api') {
                scanForServerComponents(fullPath, appDir, components);
            }
        }
        else if (item.isFile()) {
            const ext = path_1.default.extname(item.name);
            if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext))
                continue;
            try {
                const source = fs_1.default.readFileSync(fullPath, 'utf-8');
                // Only add if NOT a client component
                if (!hasClientDirective(source)) {
                    const relativePath = (0, component_identity_1.relativeComponentPath)(appDir, fullPath);
                    const moduleId = (0, component_identity_1.createComponentId)('server', relativePath);
                    const metadata = analyzeMetadata(source);
                    const renderConfig = analyzeRenderConfig(source);
                    components.push({
                        id: moduleId,
                        path: relativePath,
                        absolutePath: fullPath,
                        type: getComponentType(item.name),
                        hasMetadata: metadata.hasMetadata,
                        hasGenerateMetadata: metadata.hasGenerateMetadata,
                        hasGenerateStaticParams: renderConfig.hasGenerateStaticParams,
                        renderMode: renderConfig.renderMode,
                        revalidate: renderConfig.revalidate,
                        segmentConfig: renderConfig.segmentConfig,
                        clientDependencies: extractClientImports(source, appDir),
                    });
                }
            }
            catch (e) {
                console.warn(`[Vista RSC] Failed to read ${fullPath}:`, e);
            }
        }
    }
}
/**
 * Build route entries from discovered components
 */
function buildRoutes(components, appDir) {
    const routes = [];
    const pages = components.filter((c) => c.type === 'page');
    const layouts = components.filter((c) => c.type === 'layout');
    const loadings = components.filter((c) => c.type === 'loading');
    const errors = components.filter((c) => c.type === 'error');
    const layoutsByDir = new Map();
    for (const layout of layouts) {
        const dir = path_1.default.dirname(layout.absolutePath);
        const existing = layoutsByDir.get(dir);
        const layoutBase = path_1.default.basename(layout.absolutePath).replace(/\.[jt]sx?$/, '');
        const existingBase = existing
            ? path_1.default.basename(existing.absolutePath).replace(/\.[jt]sx?$/, '')
            : null;
        // Canonical preference: root.* over layout.* in the same directory.
        if (!existing || (layoutBase === 'root' && existingBase !== 'root')) {
            layoutsByDir.set(dir, layout);
        }
    }
    for (const page of pages) {
        const pageDir = path_1.default.dirname(page.absolutePath);
        const relativePath = path_1.default.relative(appDir, pageDir);
        if (hasReservedInternalSegment(relativePath) || hasNonPublicRouteSegment(relativePath)) {
            continue;
        }
        const sourceSegments = relativePath
            .replace(/\\/g, '/')
            .split('/')
            .filter(Boolean);
        // Build URL pattern
        let pattern = '/' + relativePath.replace(/\\/g, '/');
        let routeType = 'static';
        // Handle dynamic segments
        pattern = pattern
            .replace(/\[\.\.\.([^\]]+)\]/g, (_, name) => {
            routeType = 'catch-all';
            return `:${name}*`;
        })
            .replace(/\[([^\]]+)\]/g, (_, name) => {
            if (routeType !== 'catch-all')
                routeType = 'dynamic';
            return `:${name}`;
        });
        // Handle route groups - remove (groupname) from URL
        pattern = pattern.replace(/\/\([^)]+\)/g, '');
        // Root page
        if (pattern === '/' || pattern === '') {
            pattern = '/';
        }
        // Find layouts in ancestor directories
        const layoutPaths = [];
        let currentDir = pageDir;
        while (currentDir.startsWith(appDir)) {
            const layout = layoutsByDir.get(currentDir);
            if (layout) {
                layoutPaths.unshift(layout.absolutePath);
            }
            const parent = path_1.default.dirname(currentDir);
            if (parent === currentDir)
                break;
            currentDir = parent;
        }
        // Find loading and error in same directory
        const loading = loadings.find((l) => path_1.default.dirname(l.absolutePath) === pageDir);
        const error = errors.find((e) => path_1.default.dirname(e.absolutePath) === pageDir);
        // Determine rendering mode from page exports
        let renderMode = 'dynamic'; // default: dynamic
        const pageRevalidate = page.revalidate;
        const hasStaticParams = page.hasGenerateStaticParams;
        const pageRenderMode = page.renderMode;
        // Cast routeType to string — TS can't track mutations from .replace() callbacks
        const rt = routeType;
        const mergedSegmentConfig = (0, segment_config_1.mergeSegmentConfigs)([
            ...layoutPaths.map((layoutPath) => layouts.find((layout) => layout.absolutePath === layoutPath)),
            page,
        ]);
        if (mergedSegmentConfig.dynamic === 'force-static' || pageRenderMode === 'static') {
            renderMode = 'static';
        }
        else if (mergedSegmentConfig.dynamic === 'force-dynamic' || pageRenderMode === 'dynamic') {
            renderMode = 'dynamic';
        }
        else if (pageRevalidate !== undefined && pageRevalidate > 0) {
            renderMode = 'isr';
        }
        else if (rt === 'static' && pageRenderMode === 'auto') {
            // Static URL pattern + auto mode = static by default
            renderMode = 'static';
        }
        else if ((rt === 'dynamic' || rt === 'catch-all') && hasStaticParams) {
            // Dynamic or catch-all URL pattern + generateStaticParams = can be statically generated
            renderMode = 'static';
        }
        routes.push({
            pattern,
            pagePath: page.absolutePath,
            routeDir: pageDir,
            sourceSegments,
            layoutPaths,
            loadingPath: loading?.absolutePath,
            errorPath: error?.absolutePath,
            type: routeType,
            renderMode,
            revalidate: typeof mergedSegmentConfig.revalidate === 'number'
                ? mergedSegmentConfig.revalidate
                : pageRevalidate,
            hasGenerateStaticParams: hasStaticParams,
            segmentConfig: mergedSegmentConfig,
        });
    }
    // Sort routes: static first, then dynamic, then catch-all
    routes.sort((a, b) => {
        const order = { static: 0, dynamic: 1, 'catch-all': 2 };
        return order[a.type] - order[b.type];
    });
    return routes;
}
/**
 * Collect file-based API route handlers.
 *
 * Route handlers live in the same `app/` tree as pages but are not React components,
 * so they are discovered separately from `scanForServerComponents` (which skips the
 * `api` directory and treats every file it finds as a component).
 */
function buildRouteHandlerEntries(appDir) {
    return (0, route_handler_registry_1.discoverRouteHandlers)(appDir).map((handler) => ({
        pattern: handler.pattern,
        filePath: handler.filePath,
        sourceSegments: handler.sourceSegments,
        type: handler.type,
        methods: handler.methods,
        ...(handler.runtime ? { runtime: handler.runtime } : {}),
    }));
}
/**
 * Generate the server component manifest
 */
function generateServerManifest(cwd, appDir) {
    const components = [];
    const serverActions = {};
    scanForServerComponents(appDir, appDir, components);
    const serverModules = {};
    const pathToId = {};
    for (const component of components) {
        serverModules[component.id] = component;
        const normalizedRelativePath = (0, component_identity_1.normalizeComponentPath)(component.path);
        const normalizedAbsolutePath = (0, component_identity_1.normalizeComponentPath)(component.absolutePath);
        pathToId[component.path] = component.id;
        pathToId[normalizedRelativePath] = component.id;
        pathToId[component.absolutePath] = component.id;
        pathToId[normalizedAbsolutePath] = component.id;
        try {
            const source = fs_1.default.readFileSync(component.absolutePath, 'utf-8');
            for (const action of analyzeServerActions(source, component.absolutePath)) {
                serverActions[action.id] = action;
            }
        }
        catch {
            // Ignore per-file action analysis failures and keep manifest generation resilient.
        }
    }
    const routes = buildRoutes(components, appDir);
    const routeHandlers = buildRouteHandlerEntries(appDir);
    // Get or generate build ID
    const buildIdPath = path_1.default.join(cwd, constants_1.BUILD_DIR, 'BUILD_ID');
    let buildId = 'dev';
    try {
        if (fs_1.default.existsSync(buildIdPath)) {
            buildId = fs_1.default.readFileSync(buildIdPath, 'utf-8').trim();
        }
    }
    catch (e) {
        // Use dev
    }
    return {
        buildId,
        serverModules,
        pathToId,
        routes,
        serverActions,
        routeHandlers,
    };
}
/**
 * Get server component by path
 */
function getServerComponent(manifest, filePath) {
    const moduleId = manifest.pathToId[filePath];
    if (!moduleId)
        return undefined;
    return manifest.serverModules[moduleId];
}
/**
 * Check if a path is a server component
 */
function isServerComponentPath(manifest, filePath) {
    return filePath in manifest.pathToId;
}
