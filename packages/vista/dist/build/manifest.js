"use strict";
/**
 * Vista Build Utilities
 *
 * Generates build manifests, BUILD_ID, and manages .vista output structure.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBuildId = generateBuildId;
exports.getBuildId = getBuildId;
exports.createVistaDirectories = createVistaDirectories;
exports.generateBuildManifest = generateBuildManifest;
exports.generateAppPathRoutesManifest = generateAppPathRoutesManifest;
exports.generatePrerenderManifest = generatePrerenderManifest;
exports.generateRequiredServerFilesManifest = generateRequiredServerFilesManifest;
exports.ensureJsonFile = ensureJsonFile;
exports.writeArtifactManifest = writeArtifactManifest;
exports.writeCanonicalVistaArtifacts = writeCanonicalVistaArtifacts;
exports.writeReservedVistaArtifacts = writeReservedVistaArtifacts;
exports.generateRoutesManifest = generateRoutesManifest;
exports.generateClientComponentsManifest = generateClientComponentsManifest;
exports.generateServerComponentsManifest = generateServerComponentsManifest;
exports.getWebpackCacheConfig = getWebpackCacheConfig;
exports.cleanOldCache = cleanOldCache;
exports.pruneEmptyVistaDirectories = pruneEmptyVistaDirectories;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const constants_1 = require("../constants");
const integrity_1 = require("../integrity");
// ============================================================================
// BUILD_ID Generation
// ============================================================================
/**
 * Generate a unique build ID based on timestamp and random bytes.
 */
function generateBuildId() {
    const timestamp = Date.now().toString(36);
    const random = crypto_1.default.randomBytes(4).toString('hex');
    return `${timestamp}-${random}`;
}
/**
 * Read existing BUILD_ID or generate a new one.
 */
function getBuildId(vistaDir, forceNew = false) {
    const buildIdPath = path_1.default.join(vistaDir, 'BUILD_ID');
    if (!forceNew && fs_1.default.existsSync(buildIdPath)) {
        return fs_1.default.readFileSync(buildIdPath, 'utf-8').trim();
    }
    const buildId = generateBuildId();
    fs_1.default.mkdirSync(vistaDir, { recursive: true });
    fs_1.default.writeFileSync(buildIdPath, buildId);
    return buildId;
}
/**
 * Create the .vista directory structure.
 * In legacy mode, only creates root (no empty server/static dirs).
 * In RSC mode, creates the full structure for server/client bundles.
 */
function createVistaDirectories(cwd, mode = 'legacy') {
    const root = path_1.default.join(cwd, constants_1.BUILD_DIR);
    const dirs = {
        root,
        cache: path_1.default.join(root, 'cache'),
        imageCache: path_1.default.join(root, 'cache', 'images'),
        server: path_1.default.join(root, 'server'),
        static: path_1.default.join(root, 'static'),
        chunks: path_1.default.join(root, 'static', 'chunks'),
        css: path_1.default.join(root, 'static', 'css'),
        media: path_1.default.join(root, 'static', 'media'),
    };
    // Always create root
    fs_1.default.mkdirSync(root, { recursive: true });
    if (mode === 'rsc') {
        [dirs.root, dirs.cache, dirs.imageCache, dirs.server, dirs.static, dirs.chunks, dirs.media].forEach((dir) => {
            fs_1.default.mkdirSync(dir, { recursive: true });
        });
    }
    // Legacy mode: only root dir is created — webpack outputs directly into .vista/
    return dirs;
}
/**
 * Generate build-manifest.json
 */
function generateBuildManifest(vistaDir, buildId, pages = {}) {
    const manifest = {
        buildId,
        polyfillFiles: [],
        devFiles: [],
        lowPriorityFiles: [],
        rootMainFiles: [`${constants_1.STATIC_CHUNKS_PATH}webpack.js`, `${constants_1.STATIC_CHUNKS_PATH}main.js`],
        pages,
    };
    const manifestPath = path_1.default.join(vistaDir, 'build-manifest.json');
    fs_1.default.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return manifest;
}
function toRegexFromPattern(pattern) {
    if (pattern === '/') {
        return '^/$';
    }
    const normalized = pattern.startsWith('/') ? pattern.slice(1) : pattern;
    const parts = normalized.split('/').filter(Boolean);
    const regexParts = parts.map((part) => {
        if (!part.startsWith(':')) {
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        const dynamicMatch = /^:([a-zA-Z0-9_]+)(\*)?(\?)?$/.exec(part);
        if (!dynamicMatch) {
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        const [, paramName, isCatchAll, isOptional] = dynamicMatch;
        if (isCatchAll && isOptional) {
            return `(?<${paramName}>.*)`;
        }
        if (isCatchAll) {
            return `(?<${paramName}>.+)`;
        }
        return `(?<${paramName}>[^/]+)`;
    });
    return `^/${regexParts.join('/')}$`;
}
function toRouteHandlerInfo(handler) {
    return {
        page: handler.filePath,
        regex: toRegexFromPattern(handler.pattern),
        namedRegex: toRegexFromPattern(handler.pattern),
        routeKeys: {},
        methods: handler.methods || [],
        ...(handler.runtime ? { runtime: handler.runtime } : {}),
    };
}
function toRouteInfo(route) {
    return {
        page: route.pagePath,
        regex: toRegexFromPattern(route.pattern),
        routeKeys: {},
        namedRegex: toRegexFromPattern(route.pattern),
    };
}
function generateAppPathRoutesManifest(vistaDir, routes = [], routeHandlers = []) {
    const manifest = {};
    routes.forEach((route) => {
        manifest[route.pattern] = route.pagePath;
    });
    // A page and a route handler cannot both own a URL. Pages win, so a stray
    // `route.ts` next to a `page.tsx` cannot silently take over the route.
    routeHandlers.forEach((handler) => {
        if (!(handler.pattern in manifest)) {
            manifest[handler.pattern] = handler.filePath;
        }
    });
    fs_1.default.writeFileSync(path_1.default.join(vistaDir, 'app-path-routes-manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest;
}
function generatePrerenderManifest(vistaDir) {
    const manifest = {
        version: 1,
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
        preview: {
            previewModeId: '',
            previewModeSigningKey: '',
            previewModeEncryptionKey: '',
        },
    };
    fs_1.default.writeFileSync(path_1.default.join(vistaDir, 'prerender-manifest.json'), JSON.stringify(manifest, null, 2));
}
function generateRequiredServerFilesManifest(cwd, vistaDir, extraFiles = [], appDir = cwd) {
    const files = Array.from(new Set([
        `${constants_1.BUILD_DIR}/BUILD_ID`,
        `${constants_1.BUILD_DIR}/build-manifest.json`,
        `${constants_1.BUILD_DIR}/routes-manifest.json`,
        `${constants_1.BUILD_DIR}/app-path-routes-manifest.json`,
        `${constants_1.BUILD_DIR}/server/server-manifest.json`,
        ...extraFiles,
    ]));
    const manifest = {
        version: 1,
        config: {},
        appDir,
        relativeAppDir: path_1.default.relative(cwd, appDir) || '.',
        files,
    };
    fs_1.default.writeFileSync(path_1.default.join(vistaDir, 'required-server-files.json'), JSON.stringify(manifest, null, 2));
}
function ensureJsonFile(vistaDir, relativePath, fallback = {}) {
    const absolutePath = path_1.default.join(vistaDir, relativePath);
    if (!fs_1.default.existsSync(absolutePath)) {
        fs_1.default.writeFileSync(absolutePath, JSON.stringify(fallback, null, 2));
    }
}
function writeArtifactManifest(vistaDir, buildId, extraManifestEntries = {}) {
    const artifactManifest = {
        schemaVersion: 1,
        buildId,
        generatedAt: new Date().toISOString(),
        __integrity: (0, integrity_1.generateBuildWatermark)(),
        manifests: {
            buildManifest: 'build-manifest.json',
            routesManifest: 'routes-manifest.json',
            appPathRoutesManifest: 'app-path-routes-manifest.json',
            prerenderManifest: 'prerender-manifest.json',
            requiredServerFiles: 'required-server-files.json',
            reactClientManifest: 'react-client-manifest.json',
            reactServerManifest: 'react-server-manifest.json',
            ...extraManifestEntries,
        },
    };
    fs_1.default.writeFileSync(path_1.default.join(vistaDir, 'artifact-manifest.json'), JSON.stringify(artifactManifest, null, 2));
    return artifactManifest;
}
function writeCanonicalVistaArtifacts(cwd, vistaDir, buildId, routes = [], routeHandlers = []) {
    const staticRoutes = routes.filter((route) => route.type === 'static').map(toRouteInfo);
    const dynamicRoutes = routes.filter((route) => route.type !== 'static').map(toRouteInfo);
    generateBuildManifest(vistaDir, buildId);
    generateRoutesManifest(vistaDir, staticRoutes, dynamicRoutes, routeHandlers);
    generateAppPathRoutesManifest(vistaDir, routes, routeHandlers);
    generatePrerenderManifest(vistaDir);
    generateRequiredServerFilesManifest(cwd, vistaDir);
    // Keep canonical React manifest filenames present for validation consistency.
    ensureJsonFile(vistaDir, 'react-client-manifest.json', {});
    ensureJsonFile(vistaDir, 'react-server-manifest.json', {});
    return writeArtifactManifest(vistaDir, buildId);
}
function writeReservedVistaArtifacts(vistaDir, options) {
    const engineVariant = options.engineVariant || 'default';
    const generatedAt = new Date().toISOString();
    const cacheDir = path_1.default.join(vistaDir, 'cache');
    const imageCacheDir = path_1.default.join(cacheDir, 'images');
    const mediaDir = path_1.default.join(vistaDir, 'static', 'media');
    fs_1.default.mkdirSync(cacheDir, { recursive: true });
    fs_1.default.mkdirSync(imageCacheDir, { recursive: true });
    fs_1.default.mkdirSync(mediaDir, { recursive: true });
    fs_1.default.writeFileSync(path_1.default.join(cacheDir, 'cache-manifest.json'), JSON.stringify({
        schemaVersion: 1,
        buildId: options.buildId,
        generatedAt,
        engine: engineVariant,
        activeCacheRoot: engineVariant === 'flashpack' ? '.flash/cache' : '.vista/cache/webpack',
        directories: {
            localCache: '.vista/cache',
            webpack: engineVariant === 'flashpack' ? '.flash/cache/webpack' : '.vista/cache/webpack',
            images: '.vista/cache/images',
        },
        notes: [
            engineVariant === 'flashpack'
                ? 'Flashpack stores its hot build cache in .flash while .vista/cache keeps framework metadata.'
                : 'Default engine stores framework metadata here and may add webpack cache artifacts during rebuilds.',
        ],
    }, null, 2));
    fs_1.default.writeFileSync(path_1.default.join(imageCacheDir, 'manifest.json'), JSON.stringify({
        schemaVersion: 1,
        buildId: options.buildId,
        generatedAt,
        endpoint: constants_1.IMAGE_ENDPOINT,
        cacheDirectory: '.vista/cache/images',
        config: options.imagesConfig || {},
        behavior: {
            optimization: 'on-demand',
            staticImportsEmitInto: '.vista/static/media',
            publicReferencesStayIn: 'public/',
        },
    }, null, 2));
    const emittedMedia = fs_1.default
        .readdirSync(mediaDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name !== 'media-manifest.json')
        .map((entry) => entry.name)
        .sort();
    fs_1.default.writeFileSync(path_1.default.join(mediaDir, 'media-manifest.json'), JSON.stringify({
        schemaVersion: 1,
        buildId: options.buildId,
        generatedAt,
        mediaDirectory: '.vista/static/media',
        emittedFiles: emittedMedia,
        note: 'This directory is reserved for emitted media assets. Public file references are served from public/ and may leave this list empty.',
    }, null, 2));
}
/**
 * Generate routes-manifest.json from route tree.
 */
function generateRoutesManifest(vistaDir, staticRoutes = [], dynamicRoutes = [], routeHandlers = []) {
    const manifest = {
        version: 1,
        basePath: '',
        redirects: [],
        rewrites: [],
        headers: [],
        staticRoutes,
        dynamicRoutes,
        routeHandlers: routeHandlers.map(toRouteHandlerInfo),
    };
    const manifestPath = path_1.default.join(vistaDir, 'routes-manifest.json');
    fs_1.default.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return manifest;
}
/**
 * Generate manifest of client components (files with 'use client').
 */
function generateClientComponentsManifest(vistaDir, buildId, clientModules = {}) {
    const manifest = {
        buildId,
        clientModules,
    };
    const manifestPath = path_1.default.join(vistaDir, 'client-components-manifest.json');
    fs_1.default.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return manifest;
}
/**
 * Generate manifest of server components.
 */
function generateServerComponentsManifest(vistaDir, serverModules = {}) {
    const manifest = {
        serverModules,
    };
    const manifestPath = path_1.default.join(vistaDir, 'server', 'server-components-manifest.json');
    fs_1.default.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
// ============================================================================
// Cache Utilities
// ============================================================================
/**
 * Get Webpack cache configuration for persistent caching.
 */
function getWebpackCacheConfig(vistaDir, buildId, name, engineVariant = 'default', cwd = process.cwd()) {
    const cacheDirectory = engineVariant === 'flashpack'
        ? path_1.default.join(cwd, constants_1.FLASH_DIR, 'cache', 'webpack')
        : path_1.default.join(vistaDir, 'cache', 'webpack');
    return {
        type: 'filesystem',
        version: buildId,
        cacheDirectory,
        name: name,
        buildDependencies: {
            config: [__filename],
        },
    };
}
/**
 * Clean old cache entries (keeps last N builds).
 */
function cleanOldCache(vistaDir, keepBuilds = 5) {
    const cacheDir = path_1.default.join(vistaDir, 'cache', 'webpack');
    if (!fs_1.default.existsSync(cacheDir))
        return;
    const entries = fs_1.default
        .readdirSync(cacheDir)
        .map((name) => ({
        name,
        path: path_1.default.join(cacheDir, name),
        stat: fs_1.default.statSync(path_1.default.join(cacheDir, name)),
    }))
        .filter((e) => e.stat.isDirectory())
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    // Remove old cache directories
    entries.slice(keepBuilds).forEach((entry) => {
        fs_1.default.rmSync(entry.path, { recursive: true, force: true });
    });
}
function pruneEmptyVistaDirectories(vistaDir) {
    if (!fs_1.default.existsSync(vistaDir))
        return;
    const prune = (absolutePath) => {
        const entries = fs_1.default.readdirSync(absolutePath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const childPath = path_1.default.join(absolutePath, entry.name);
            prune(childPath);
        }
        // Never remove the root .vista directory itself.
        if (absolutePath === vistaDir)
            return false;
        const remaining = fs_1.default.readdirSync(absolutePath);
        if (remaining.length === 0) {
            fs_1.default.rmdirSync(absolutePath);
            return true;
        }
        return false;
    };
    prune(vistaDir);
}
