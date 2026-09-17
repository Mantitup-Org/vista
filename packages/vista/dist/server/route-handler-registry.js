"use strict";
/**
 * Discovery and resolution of file-based API route handlers (`app/**\/route.{ts,tsx,js,jsx}`).
 *
 * One scan implementation serves both sides of the framework:
 *   - the build scanner (build/rsc/server-manifest.ts) records what exists, so route
 *     handlers land in the emitted manifests alongside pages
 *   - the request path (server/typed-api-runtime.ts) resolves a URL to a handler file
 *     plus its dynamic params
 *
 * Keeping them on the same function is what stops the build manifest and the runtime
 * from disagreeing about which files are routes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTE_HANDLER_METHODS = void 0;
exports.discoverRouteHandlers = discoverRouteHandlers;
exports.getRouteHandlers = getRouteHandlers;
exports.clearRouteHandlerCache = clearRouteHandlerCache;
exports.resolveRouteHandler = resolveRouteHandler;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const route_patterns_1 = require("./route-patterns");
/** Supported HTTP methods for a route handler, in canonical order. */
exports.ROUTE_HANDLER_METHODS = [
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
];
const ROUTE_FILE_BASENAMES = new Set(['route']);
const ROUTE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIPPED_DIRECTORIES = new Set(['node_modules']);
/** How long a discovery result is reused in dev before the app dir is re-scanned. */
const DEV_SCAN_TTL_MS = 250;
function isRouteFile(fileName) {
    const extension = path_1.default.extname(fileName);
    if (!ROUTE_FILE_EXTENSIONS.has(extension)) {
        return false;
    }
    return ROUTE_FILE_BASENAMES.has(path_1.default.basename(fileName, extension));
}
/**
 * Read the exported HTTP methods and requested runtime without executing the module.
 *
 * Regex-based on purpose: this mirrors how build/rsc/server-manifest.ts already reads
 * exports, runs during a filesystem walk, and only feeds the manifest. The runtime
 * dispatch path reads the real module exports, so a miss here degrades the manifest,
 * never the request.
 */
function readRouteFileMetadata(filePath) {
    let source = '';
    try {
        source = fs_1.default.readFileSync(filePath, 'utf-8');
    }
    catch {
        return { methods: [] };
    }
    const methods = [];
    for (const method of exports.ROUTE_HANDLER_METHODS) {
        const declaration = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${method}\\b`);
        const braced = new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`);
        if (declaration.test(source) || braced.test(source)) {
            methods.push(method);
        }
    }
    const runtimeMatch = /export\s+const\s+runtime\s*=\s*['"]([\w-]+)['"]/.exec(source);
    return {
        methods,
        runtime: runtimeMatch ? runtimeMatch[1] : undefined,
    };
}
function walkForRouteFiles(dir, appDir, results) {
    let entries;
    try {
        entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        const fullPath = path_1.default.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) {
                continue;
            }
            // Parallel slots and interception routes are page-tree concepts; a route
            // handler underneath one is not reachable by URL.
            if ((0, route_patterns_1.isParallelRouteSegment)(entry.name) || (0, route_patterns_1.isInterceptionRouteSegment)(entry.name)) {
                continue;
            }
            walkForRouteFiles(fullPath, appDir, results);
            continue;
        }
        if (!entry.isFile() || !isRouteFile(entry.name)) {
            continue;
        }
        const relativeDir = path_1.default.relative(appDir, dir);
        const sourceSegments = relativeDir
            .split(path_1.default.sep)
            .filter((segment) => segment && segment !== '.');
        const parsed = (0, route_patterns_1.parseRouteSegments)(sourceSegments);
        if (!parsed) {
            continue;
        }
        const metadata = readRouteFileMetadata(fullPath);
        results.push({
            pattern: parsed.pattern,
            filePath: fullPath,
            sourceSegments,
            type: parsed.type,
            methods: metadata.methods,
            runtime: metadata.runtime,
            parsed,
        });
    }
}
/**
 * Scan an app directory for route handler files.
 *
 * Results are ordered most-specific first, so the first match during resolution is
 * the correct one.
 */
function discoverRouteHandlers(appDir) {
    if (!appDir || !fs_1.default.existsSync(appDir)) {
        return [];
    }
    const results = [];
    walkForRouteFiles(appDir, appDir, results);
    // A directory can hold at most one route file; if several extensions exist, keep a
    // deterministic winner rather than letting readdir order decide.
    const byPattern = new Map();
    for (const entry of results) {
        const existing = byPattern.get(entry.pattern);
        if (!existing || entry.filePath.localeCompare(existing.filePath) < 0) {
            byPattern.set(entry.pattern, entry);
        }
    }
    return Array.from(byPattern.values()).sort((a, b) => (0, route_patterns_1.compareRouteSpecificity)(a.parsed, b.parsed));
}
const discoveryCache = new Map();
/**
 * Cached variant of {@link discoverRouteHandlers}.
 *
 * Production builds scan once. Dev re-scans at most every {@link DEV_SCAN_TTL_MS},
 * which keeps newly added route files visible without turning every request into a
 * full directory walk.
 */
function getRouteHandlers(appDir, options = {}) {
    const cached = discoveryCache.get(appDir);
    const now = Date.now();
    if (cached && (!options.isDev || now - cached.scannedAt < DEV_SCAN_TTL_MS)) {
        return cached.handlers;
    }
    const handlers = discoverRouteHandlers(appDir);
    discoveryCache.set(appDir, { handlers, scannedAt: now });
    return handlers;
}
/** Drop cached discovery results. Exported for tests and for watch-mode invalidation. */
function clearRouteHandlerCache(appDir) {
    if (appDir) {
        discoveryCache.delete(appDir);
        return;
    }
    discoveryCache.clear();
}
/**
 * Resolve a request path to a route handler file and its dynamic params.
 *
 * Returns null when no route file matches, leaving the caller free to fall through to
 * pages, the typed API, or a 404.
 */
function resolveRouteHandler(appDir, requestPath, options = {}) {
    const handlers = getRouteHandlers(appDir, options);
    if (handlers.length === 0) {
        return null;
    }
    const requestSegments = (0, route_patterns_1.splitRequestPath)(requestPath);
    for (const handler of handlers) {
        const params = (0, route_patterns_1.matchRouteSegments)(handler.parsed, requestSegments);
        if (params) {
            return {
                filePath: handler.filePath,
                pattern: handler.pattern,
                params,
            };
        }
    }
    return null;
}
