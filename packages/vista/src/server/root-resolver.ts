import fs from 'fs';
import path from 'path';
import React from 'react';

export type RootRenderMode = 'document' | 'legacy';

export interface ResolvedRootLayout {
  appDir: string;
  rootPath: string;
  component: React.ComponentType<any>;
  metadata: any;
  notFoundRoute?: string;
  mode: RootRenderMode;
  usedLayoutFallback: boolean;
}

const FILE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];
let hasWarnedLayoutFallback = false;

function resolveAppModuleByStem(appDir: string, stem: string): string | null {
  for (const ext of FILE_EXTENSIONS) {
    const absolutePath = path.join(appDir, `${stem}${ext}`);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }
  return null;
}

function normalizeNotFoundRoute(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function detectRootMode(rootPath: string): RootRenderMode {
  try {
    const source = fs.readFileSync(rootPath, 'utf-8');
    const normalized = source.toLowerCase();
    if (normalized.includes('<html') && normalized.includes('<body')) {
      return 'document';
    }
  } catch {
    // Fallback to legacy mode on read failures.
  }
  return 'legacy';
}

function getAppDir(cwd: string): string {
  const appDir = path.join(cwd, 'app');
  if (!fs.existsSync(appDir)) {
    const srcAppDir = path.join(cwd, 'src', 'app');
    if (fs.existsSync(srcAppDir)) {
      return srcAppDir;
    }
  }
  return appDir;
}

export function resolveRootLayout(cwd: string, isDev: boolean): ResolvedRootLayout {
  const appDir = getAppDir(cwd);
  const rootPath = resolveAppModuleByStem(appDir, 'root');
  const layoutPath = resolveAppModuleByStem(appDir, 'layout');

  const selectedPath = rootPath ?? layoutPath;
  if (!selectedPath) {
    throw new Error(
      'Missing app/root.(tsx|ts|jsx|js). Add app/root.tsx (canonical) or app/layout.tsx (fallback).'
    );
  }

  const usedLayoutFallback = !rootPath && !!layoutPath;
  if (usedLayoutFallback && !hasWarnedLayoutFallback) {
    console.warn(
      '[vista:ssr] app/layout.tsx fallback in use. Please migrate to app/root.tsx (canonical Vista root).'
    );
    hasWarnedLayoutFallback = true;
  }

  if (isDev) {
    try {
      delete require.cache[require.resolve(selectedPath)];
    } catch {
      // Ignore cache misses in dev mode.
    }
  }

  const rootModule = require(selectedPath);
  const component = rootModule.default;
  if (!component) {
    throw new Error(`Root layout must export a default component: ${selectedPath}`);
  }

  const rawNotFoundRoute =
    typeof rootModule.notFoundRoute === 'string' ? rootModule.notFoundRoute : undefined;
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

export function resolveRoutePagePath(cwd: string, routePath: string): string | null {
  const appDir = getAppDir(cwd);
  const normalizedRoute = normalizeNotFoundRoute(routePath);

  if (normalizedRoute === '/' || normalizedRoute === '/index') {
    for (const ext of FILE_EXTENSIONS) {
      const indexPath = path.join(appDir, `index${ext}`);
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }
      const pagePath = path.join(appDir, `page${ext}`);
      if (fs.existsSync(pagePath)) {
        return pagePath;
      }
    }
    return null;
  }

  const routeDir = path.join(appDir, normalizedRoute.slice(1));
  for (const ext of FILE_EXTENSIONS) {
    const nestedPagePath = path.join(routeDir, `page${ext}`);
    if (fs.existsSync(nestedPagePath)) {
      return nestedPagePath;
    }
  }

  for (const ext of FILE_EXTENSIONS) {
    const directPagePath = path.join(appDir, `${normalizedRoute.slice(1)}${ext}`);
    if (fs.existsSync(directPagePath)) {
      return directPagePath;
    }
  }

  return null;
}

export interface ResolvedNotFoundComponent {
  component: React.ComponentType<any>;
  sourcePath: string;
}

export function resolveNotFoundComponent(
  cwd: string,
  rootLayout: ResolvedRootLayout,
  isDev: boolean
): ResolvedNotFoundComponent | null {
  const appDir = getAppDir(cwd);
  const candidates: string[] = [];

  // 1. Explicit notFoundRoute (highest priority)
  if (rootLayout.notFoundRoute) {
    const routePath = resolveRoutePagePath(cwd, rootLayout.notFoundRoute);
    if (routePath) {
      candidates.push(routePath);
    } else {
      console.warn(
        `[vista:ssr] notFoundRoute "${rootLayout.notFoundRoute}" was configured but no page was found. Falling back.`
      );
    }
  }

  // 2. Auto-detect: app/[not-found]/page.* (reserved internal segment)
  if (candidates.length === 0) {
    const autoDetectDir = path.join(appDir, '[not-found]');
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
    const hasAutoDetect = resolveAppModuleByStem(path.join(appDir, '[not-found]'), 'page') !== null;
    const hasLegacy = legacyNotFound !== null;
    if (hasAutoDetect && hasLegacy) {
      console.warn(
        '[vista:ssr] Both app/[not-found]/page.* and app/not-found.* exist. ' +
          'Auto-detect (app/[not-found]/page.*) takes precedence. ' +
          'Set notFoundRoute in your root export to pick explicitly, or remove one source.'
      );
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
    } catch {
      // Continue to next candidate.
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Nested Layout Chain Resolution
// ---------------------------------------------------------------------------

export interface ResolvedLayout {
  /** Absolute file path of the layout */
  filePath: string;
  /** The React component */
  component: React.ComponentType<any>;
  /** Metadata exports, if any */
  metadata?: any;
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
export function resolveLayoutChain(cwd: string, pageDir: string, isDev: boolean): ResolvedLayout[] {
  const appDir = getAppDir(cwd);
  const chain: ResolvedLayout[] = [];

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
    accumulator = path.join(accumulator, segment);
    dirs.push(accumulator);
  }

  for (const dir of dirs) {
    // Try root.tsx first (canonical Vista root), then layout.tsx (Next.js compat)
    const layoutFile = resolveAppModuleByStem(dir, 'root') ?? resolveAppModuleByStem(dir, 'layout');

    if (!layoutFile) continue;

    if (isDev) {
      try {
        delete require.cache[require.resolve(layoutFile)];
      } catch {
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
    } catch (err) {
      console.warn(`[vista:ssr] Failed to load layout at ${layoutFile}:`, (err as Error)?.message);
    }
  }

  return chain;
}
