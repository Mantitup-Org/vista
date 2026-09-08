"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRootLayout = resolveRootLayout;
exports.resolveRoutePagePath = resolveRoutePagePath;
exports.resolveNotFoundComponent = resolveNotFoundComponent;
exports.resolveLayoutChain = resolveLayoutChain;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const FILE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];
let hasWarnedLayoutFallback = false;
function resolveAppModuleByStem(appDir, stem) {
    for (const ext of FILE_EXTENSIONS) {
        const absolutePath = path_1.default.join(appDir, `${stem}${ext}`);
        if (fs_1.default.existsSync(absolutePath)) {
            return absolutePath;
        }
    }
    return null;
}
function normalizeNotFoundRoute(raw) {
    if (!raw)
        return '';
    const trimmed = raw.trim();
    if (!trimmed)
        return '';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
function detectRootMode(rootPath) {
    try {
        const source = fs_1.default.readFileSync(rootPath, 'utf-8');
        const normalized = source.toLowerCase();
        if (normalized.includes('<html') && normalized.includes('<body')) {
            return 'document';
        }
    }
    catch {
        // Fallback to legacy mode on read failures.
    }
    return 'legacy';
}
function getAppDir(cwd) {
    const appDir = path_1.default.join(cwd, 'app');
    if (!fs_1.default.existsSync(appDir)) {
        const srcAppDir = path_1.default.join(cwd, 'src', 'app');
        if (fs_1.default.existsSync(srcAppDir)) {
            return srcAppDir;
        }
    }
    return appDir;
}
function resolveRootLayout(cwd, isDev) {
    const appDir = getAppDir(cwd);
    const rootPath = resolveAppModuleByStem(appDir, 'root');
    const layoutPath = resolveAppModuleByStem(appDir, 'layout');
    const selectedPath = rootPath ?? layoutPath;
    if (!selectedPath) {
        throw new Error('Missing app/root.(tsx|ts|jsx|js). Add app/root.tsx (canonical) or app/layout.tsx (fallback).');
    }
    const usedLayoutFallback = !rootPath && !!layoutPath;
    if (usedLayoutFallback && !hasWarnedLayoutFallback) {
        console.warn('[vista:ssr] app/layout.tsx fallback in use. Please migrate to app/root.tsx (canonical Vista root).');
        hasWarnedLayoutFallback = true;
    }
    if (isDev) {
        try {
            delete require.cache[require.resolve(selectedPath)];
        }
        catch {
            // Ignore cache misses in dev mode.
        }
    }
    const rootModule = require(selectedPath);
    const component = rootModule.default;
    if (!component) {
        throw new Error(`Root layout must export a default component: ${selectedPath}`);
    }
    const rawNotFoundRoute = typeof rootModule.notFoundRoute === 'string' ? rootModule.notFoundRoute : undefined;
    const notFoundRoute = rawNotFoundRoute ? normalizeNotFoundRoute(rawNotFoundRoute) : undefined;
    return {
        appDir,
        rootPath: selectedPath,
        component,
        metadata: rootModule.metadata ?? {},
        notFoundRoute,
        mode: detectRootMode(selectedPath),
        usedLayoutFallback,
    };
}
function resolveRoutePagePath(cwd, routePath) {
    const appDir = getAppDir(cwd);
    const normalizedRoute = normalizeNotFoundRoute(routePath);
    if (normalizedRoute === '/' || normalizedRoute === '/index') {
        for (const ext of FILE_EXTENSIONS) {
            const indexPath = path_1.default.join(appDir, `index${ext}`);
            if (fs_1.default.existsSync(indexPath)) {
                return indexPath;
            }
            const pagePath = path_1.default.join(appDir, `page${ext}`);
            if (fs_1.default.existsSync(pagePath)) {
                return pagePath;
            }
        }
        return null;
    }
    const routeDir = path_1.default.join(appDir, normalizedRoute.slice(1));
    for (const ext of FILE_EXTENSIONS) {
        const nestedPagePath = path_1.default.join(routeDir, `page${ext}`);
        if (fs_1.default.existsSync(nestedPagePath)) {
            return nestedPagePath;
        }
    }
    for (const ext of FILE_EXTENSIONS) {
        const directPagePath = path_1.default.join(appDir, `${normalizedRoute.slice(1)}${ext}`);
        if (fs_1.default.existsSync(directPagePath)) {
            return directPagePath;
        }
    }
    return null;
}
function resolveNotFoundComponent(cwd, rootLayout, isDev) {
    const appDir = getAppDir(cwd);
    const candidates = [];
    // 1. Explicit notFoundRoute (highest priority)
    if (rootLayout.notFoundRoute) {
        const routePath = resolveRoutePagePath(cwd, rootLayout.notFoundRoute);
        if (routePath) {
            candidates.push(routePath);
        }
        else {
            console.warn(`[vista:ssr] notFoundRoute "${rootLayout.notFoundRoute}" was configured but no page was found. Falling back.`);
        }
    }
    // 2. Auto-detect: app/[not-found]/page.* (reserved internal segment)
    if (candidates.length === 0) {
        const autoDetectDir = path_1.default.join(appDir, '[not-found]');
        const autoDetectPage = resolveAppModuleByStem(autoDetectDir, 'page');
        if (autoDetectPage) {
            candidates.push(autoDetectPage);
        }
    }
    // 3. Legacy fallback: app/not-found.*
    const legacyNotFound = resolveAppModuleByStem(appDir, 'not-found');
    if (legacyNotFound && candidates.length === 0) {
        candidates.push(legacyNotFound);
    }
    // Warn when both auto-detect and legacy exist without explicit override
    if (!rootLayout.notFoundRoute) {
        const hasAutoDetect = resolveAppModuleByStem(path_1.default.join(appDir, '[not-found]'), 'page') !== null;
        const hasLegacy = legacyNotFound !== null;
        if (hasAutoDetect && hasLegacy) {
            console.warn('[vista:ssr] Both app/[not-found]/page.* and app/not-found.* exist. ' +
                'Auto-detect (app/[not-found]/page.*) takes precedence. ' +
                'Set notFoundRoute in your root export to pick explicitly, or remove one source.');
        }
    }
    for (const candidate of candidates) {
        try {
            if (isDev) {
                delete require.cache[require.resolve(candidate)];
            }
            const module = require(candidate);
            const component = module.default;
            if (component) {
                return { component, sourcePath: candidate };
            }
        }
        catch {
            // Continue to next candidate.
        }
    }
    return null;
}
/**
 * Resolve the full chain of layout components from the app root down to the
 * directory containing the target page. Returns an array ordered from
 * outermost (root) to innermost (closest to the page).
 *
 * This is the legacy-engine counterpart to the `layoutPaths` array that the
 * RSC manifest already computes. We need it because the legacy engine never
 * consults the server manifest.
 *
 * @param cwd     Project root
 * @param pageDir Absolute path of the directory that contains the page file
 * @param isDev   Bust require-cache in development
 */
function resolveLayoutChain(cwd, pageDir, isDev) {
    const appDir = getAppDir(cwd);
    const chain = [];
    // Walk from app/ root down to the page's directory, collecting layouts
    // Normalise both to forward-slash for reliable prefix comparison
    const normPageDir = pageDir.replace(/\\/g, '/');
    const normAppDir = appDir.replace(/\\/g, '/');
    if (!normPageDir.startsWith(normAppDir)) {
        // Page is outside the app directory — shouldn't happen, but be safe
        return chain;
    }
    // Segments between appDir and pageDir (may be empty for root pages)
    const relativeParts = normPageDir.slice(normAppDir.length).split('/').filter(Boolean);
    // Check each directory from root → page dir
    const dirs = [appDir];
    let accumulator = appDir;
    for (const segment of relativeParts) {
        accumulator = path_1.default.join(accumulator, segment);
        dirs.push(accumulator);
    }
    for (const dir of dirs) {
        // Try root.tsx first (canonical Vista root), then layout.tsx (Next.js compat)
        const layoutFile = resolveAppModuleByStem(dir, 'root') ?? resolveAppModuleByStem(dir, 'layout');
        if (!layoutFile)
            continue;
        if (isDev) {
            try {
                delete require.cache[require.resolve(layoutFile)];
            }
            catch {
                // ignore
            }
        }
        try {
            const mod = require(layoutFile);
            const comp = mod.default;
            if (comp) {
                chain.push({
                    filePath: layoutFile,
                    component: comp,
                    metadata: mod.metadata,
                });
            }
        }
        catch (err) {
            console.warn(`[vista:ssr] Failed to load layout at ${layoutFile}:`, err?.message);
        }
    }
    return chain;
}
