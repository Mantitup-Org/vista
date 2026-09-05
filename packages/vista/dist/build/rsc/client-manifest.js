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
exports.generateClientManifest = generateClientManifest;
exports.generateClientManifestWithRoots = generateClientManifestWithRoots;
exports.getClientComponent = getClientComponent;
exports.getClientComponentByPath = getClientComponentByPath;
exports.isClientComponentPath = isClientComponentPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const component_identity_1 = require("./component-identity");
const constants_1 = require("../../constants");
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
/**
 * Scan directory recursively for client components
 */
function scanForClientComponents(dir, scanRoot, components, pathPrefix = '') {
    if (!fs_1.default.existsSync(dir))
        return;
    const items = fs_1.default.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path_1.default.join(dir, item.name);
        if (item.isDirectory()) {
            if (!item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'api') {
                scanForClientComponents(fullPath, scanRoot, components, pathPrefix);
            }
        }
        else if (item.isFile()) {
            const ext = path_1.default.extname(item.name);
            if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext))
                continue;
            const base = path_1.default.basename(item.name, ext);
            if (base === 'route')
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
    return generateClientManifestWithRoots(cwd, appDir);
}
function generateClientManifestWithRoots(cwd, appDir, additionalRoots = []) {
    const components = [];
    scanForClientComponents(appDir, appDir, components);
    for (const root of additionalRoots) {
        if (!fs_1.default.existsSync(root.dir))
            continue;
        scanForClientComponents(root.dir, root.dir, components, root.prefix || '');
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
        // Map server path to client chunk for SSR
        ssrModuleMapping[component.absolutePath] = `${constants_1.STATIC_CHUNKS_PATH}${component.chunkName}.js`;
        ssrModuleMapping[normalizedAbsolutePath] = `${constants_1.STATIC_CHUNKS_PATH}${component.chunkName}.js`;
    }
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
