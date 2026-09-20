import fs from 'fs';
import path from 'path';

/**
 * Resolve the App Router source directory.
 *
 * Supports both layouts (Next-compatible):
 * - `<cwd>/app`
 * - `<cwd>/src/app`
 *
 * Preference when both exist: root `app/` (matches existing middleware discovery).
 * When neither exists, returns `<cwd>/app` so callers can emit a clear missing-app error.
 */
export function resolveAppDir(cwd: string): string {
  const rootApp = path.join(cwd, 'app');
  const srcApp = path.join(cwd, 'src', 'app');

  if (isDirectory(rootApp)) return rootApp;
  if (isDirectory(srcApp)) return srcApp;
  return rootApp;
}

/** Like resolveAppDir, but returns null when no app directory exists yet. */
export function resolveAppDirOrNull(cwd: string): string | null {
  const rootApp = path.join(cwd, 'app');
  const srcApp = path.join(cwd, 'src', 'app');

  if (isDirectory(rootApp)) return rootApp;
  if (isDirectory(srcApp)) return srcApp;
  return null;
}

/**
 * True when the resolved app dir lives under `src/` (i.e. `src/app`).
 */
export function isSrcAppLayout(cwd: string, appDir: string = resolveAppDir(cwd)): boolean {
  const relative = path.relative(cwd, appDir).replace(/\\/g, '/');
  return relative === 'src/app' || relative.startsWith('src/app/');
}

/**
 * Shared UI directory paired with the app layout.
 * Prefers `src/components` for `src/app` projects, otherwise root `components/`.
 */
export function resolveComponentsDir(cwd: string): string {
  const appDir = resolveAppDirOrNull(cwd);
  const preferSrc = appDir ? isSrcAppLayout(cwd, appDir) : false;

  const srcComponents = path.join(cwd, 'src', 'components');
  const rootComponents = path.join(cwd, 'components');

  if (preferSrc) {
    if (isDirectory(srcComponents)) return srcComponents;
    if (isDirectory(rootComponents)) return rootComponents;
    return srcComponents;
  }

  if (isDirectory(rootComponents)) return rootComponents;
  if (isDirectory(srcComponents)) return srcComponents;
  return rootComponents;
}

function isDirectory(absolutePath: string): boolean {
  try {
    return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory();
  } catch {
    return false;
  }
}
