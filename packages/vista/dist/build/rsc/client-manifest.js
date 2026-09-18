"use strict";
/**
 * Client Component Manifest Generator
 *
 * Scans the app directory and builds a manifest of all Client Components.
 * Client components are those with 'use client' directive.
 *
 * The manifest maps component paths to their chunk names for client-side loading.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverProjectClientRoots = discoverProjectClientRoots;
exports.generateClientManifest = generateClientManifest;
exports.generateClientManifestWithRoots = generateClientManifestWithRoots;
exports.getClientComponent = getClientComponent;
exports.getClientComponentByPath = getClientComponentByPath;
exports.isClientComponentPath = isClientComponentPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const component_identity_1 = require("./component-identity");
const constants_1 = require("../../constants");
const native_scanner_1 = require("./native-scanner");
const PROJECT_CLIENT_SCAN_SKIP = new Set([
    'node_modules',
    '.vista',
    '.flash',
    'dist',
    'public',
    'coverage',
    'build',
    'out',
]);
/**
 * Top-level app directories that may contain `'use client'` modules.
 * Discovery is directory membership, not the import graph, so `utils/`,
 * `lib/`, and `src/` have to be scanned explicitly or they never enter
 * the React Client Manifest.
 */
function discoverProjectClientRoots(cwd) {
    const roots = [];
    if (!fs_1.default.existsSync(cwd)) {
        return roots;
    }
    let entries;
    try {
        entries = fs_1.default.readdirSync(cwd, { withFileTypes: true });
    }
    catch {
        return roots;
    }
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        if (entry.name.startsWith('.'))
            continue;
        if (PROJECT_CLIENT_SCAN_SKIP.has(entry.name))
            continue;
        roots.push({
            dir: path_1.default.join(cwd, entry.name),
            prefix: `${entry.name.replace(/\\/g, '/')}/`,
        });
    }
    return roots;
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
    const trimmed = source.trimStart();
    if (trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"')) {
        return true;
    }
    if (rustNative?.isClientComponent) {
        return rustNative.isClientComponent(source);
    }
    return false;
}
/**
 * Extract export names from source (simple regex approach)
 */
function extractExports(source) {
    const exports = [];
    // Default export
    if (/export\s+default\s+/.test(source)) {
        exports.push('default');
    }
    // Named exports: export function Name, export const Name, export class Name
    const namedExportRegex = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Z][a-zA-Z0-9_]*)/g;
    let match;
    while ((match = namedExportRegex.exec(source)) !== null) {
        exports.push(match[1]);
    }
    // Export { Name1, Name2 }
    const reExportRegex = /export\s+\{([^}]+)\}/g;
    while ((match = reExportRegex.exec(source)) !== null) {
        const names = match[1]
            .split(',')
            .map((n) => n
            .trim()
            .split(/\s+as\s+/)
            .pop()
            ?.trim())
            .filter(Boolean);
        exports.push(...names);
    }
    return [...new Set(exports)];
}
function isSameOrInside(target, ancestor) {
    const resolvedTarget = path_1.default.resolve(target);
    const resolvedAncestor = path_1.default.resolve(ancestor);
    if (resolvedTarget === resolvedAncestor)
        return true;
    const prefix = resolvedAncestor.endsWith(path_1.default.sep)
        ? resolvedAncestor
        : `${resolvedAncestor}${path_1.default.sep}`;
    return resolvedTarget.startsWith(prefix);
}
function additionalRootsMatchDiscovery(cwd, appDir, additionalRoots) {
    const discovered = discoverProjectClientRoots(cwd).filter((root) => path_1.default.resolve(root.dir) !== path_1.default.resolve(appDir));
    if (additionalRoots.length !== discovered.length)
        return false;
    const extra = new Set(additionalRoots.map((root) => path_1.default.resolve(root.dir)));
    return discovered.every((root) => extra.has(path_1.default.resolve(root.dir)));
}
/**
 * Scan directory recursively for client components
 */
function scanForClientComponents(dir, scanRoot, components, pathPrefix = '', skipInside) {
    if (!fs_1.default.existsSync(dir))
        return;
    if (skipInside && isSameOrInside(dir, skipInside))
        return;
    const items = fs_1.default.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path_1.default.join(dir, item.name);
        if (item.isDirectory()) {
            if (!item.name.startsWith('.') && item.name !== 'node_modules') {
                scanForClientComponents(fullPath, scanRoot, components, pathPrefix, skipInside);
            }
        }
        else if (item.isFile()) {
            if (skipInside && isSameOrInside(fullPath, skipInside))
                continue;
            const ext = path_1.default.extname(item.name);
            if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext))
                continue;
            try {
                const source = fs_1.default.readFileSync(fullPath, 'utf-8');
                if (hasClientDirective(source)) {
                    const relativePathBase = (0, component_identity_1.relativeComponentPath)(scanRoot, fullPath);
                    const relativePath = pathPrefix ? `${pathPrefix}${relativePathBase}` : relativePathBase;
                    const moduleId = (0, component_identity_1.createComponentId)('client', relativePath);
                    components.push({
                        id: moduleId,
                        path: relativePath,
                        absolutePath: fullPath,
                        chunkName: (0, component_identity_1.createChunkName)(relativePath),
                        exports: extractExports(source),
                        async: false,
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
 * Generate the client component manifest
 */
function generateClientManifest(cwd, appDir) {
    const additionalRoots = discoverProjectClientRoots(cwd).filter((root) => path_1.default.resolve(root.dir) !== path_1.default.resolve(appDir));
    return generateClientManifestWithRoots(cwd, appDir, additionalRoots);
}
function readBuildId(cwd) {
    const buildIdPath = path_1.default.join(cwd, constants_1.BUILD_DIR, 'BUILD_ID');
    try {
        if (fs_1.default.existsSync(buildIdPath)) {
            return fs_1.default.readFileSync(buildIdPath, 'utf-8').trim();
        }
    }
    catch {
        // Use dev
    }
    return 'dev';
}
function nativeClientManifestToJs(native) {
    const clientModules = {};
    const pathToId = {};
    const ssrModuleMapping = {};
    for (const component of native.clientModules) {
        const entry = {
            id: component.id,
            path: component.path,
            absolutePath: component.absolutePath,
            chunkName: component.chunkName,
            exports: component.exports,
            async: component.asyncLoad,
        };
        clientModules[component.id] = entry;
        const normalizedRelativePath = (0, component_identity_1.normalizeComponentPath)(component.path);
        const normalizedAbsolutePath = (0, component_identity_1.normalizeComponentPath)(component.absolutePath);
        pathToId[component.path] = component.id;
        pathToId[normalizedRelativePath] = component.id;
        pathToId[component.absolutePath] = component.id;
        pathToId[normalizedAbsolutePath] = component.id;
        ssrModuleMapping[component.absolutePath] = `${constants_1.STATIC_CHUNKS_PATH}${component.chunkName}.js`;
        ssrModuleMapping[normalizedAbsolutePath] = `${constants_1.STATIC_CHUNKS_PATH}${component.chunkName}.js`;
    }
    return {
        buildId: native.buildId,
        clientModules,
        pathToId,
        ssrModuleMapping,
    };
}
function generateClientManifestWithRoots(cwd, appDir, additionalRoots = []) {
    if (additionalRootsMatchDiscovery(cwd, appDir, additionalRoots)) {
        const native = (0, native_scanner_1.generateClientManifestForProjectNative)(cwd, appDir, readBuildId(cwd));
        if (native && Array.isArray(native.clientModules)) {
            return nativeClientManifestToJs(native);
        }
    }
    const components = [];
    scanForClientComponents(appDir, appDir, components);
    for (const root of additionalRoots) {
        if (!fs_1.default.existsSync(root.dir))
            continue;
        scanForClientComponents(root.dir, root.dir, components, root.prefix || '', appDir);
    }
    const clientModules = {};
    const pathToId = {};
    const ssrModuleMapping = {};
    for (const component of components) {
        clientModules[component.id] = component;
        const normalizedRelativePath = (0, component_identity_1.normalizeComponentPath)(component.path);
        const normalizedAbsolutePath = (0, component_identity_1.normalizeComponentPath)(component.absolutePath);
        pathToId[component.path] = component.id;
        pathToId[normalizedRelativePath] = component.id;
        pathToId[component.absolutePath] = component.id;
        pathToId[normalizedAbsolutePath] = component.id;
        ssrModuleMapping[component.absolutePath] = `${constants_1.STATIC_CHUNKS_PATH}${component.chunkName}.js`;
        ssrModuleMapping[normalizedAbsolutePath] = `${constants_1.STATIC_CHUNKS_PATH}${component.chunkName}.js`;
    }
    return {
        buildId: readBuildId(cwd),
        clientModules,
        pathToId,
        ssrModuleMapping,
    };
}
/**
 * Get client component info by module ID
 */
function getClientComponent(manifest, moduleId) {
    return manifest.clientModules[moduleId];
}
/**
 * Get client component by file path
 */
function getClientComponentByPath(manifest, filePath) {
    const moduleId = manifest.pathToId[filePath];
    if (!moduleId)
        return undefined;
    return manifest.clientModules[moduleId];
}
/**
 * Check if a path is a client component
 */
function isClientComponentPath(manifest, filePath) {
    return filePath in manifest.pathToId;
}
