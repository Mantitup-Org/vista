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
export declare function resolveAppDir(cwd: string): string;
/** Like resolveAppDir, but returns null when no app directory exists yet. */
export declare function resolveAppDirOrNull(cwd: string): string | null;
/**
 * True when the resolved app dir lives under `src/` (i.e. `src/app`).
 */
export declare function isSrcAppLayout(cwd: string, appDir?: string): boolean;
/**
 * Shared UI directory paired with the app layout.
 * Prefers `src/components` for `src/app` projects, otherwise root `components/`.
 */
export declare function resolveComponentsDir(cwd: string): string;
