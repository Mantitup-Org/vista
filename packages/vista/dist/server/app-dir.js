"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAppDir = resolveAppDir;
exports.resolveAppDirOrNull = resolveAppDirOrNull;
exports.isSrcAppLayout = isSrcAppLayout;
exports.resolveComponentsDir = resolveComponentsDir;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
function resolveAppDir(cwd) {
    const rootApp = path_1.default.join(cwd, 'app');
    const srcApp = path_1.default.join(cwd, 'src', 'app');
    if (isDirectory(rootApp))
        return rootApp;
    if (isDirectory(srcApp))
        return srcApp;
    return rootApp;
}
/** Like resolveAppDir, but returns null when no app directory exists yet. */
function resolveAppDirOrNull(cwd) {
    const rootApp = path_1.default.join(cwd, 'app');
    const srcApp = path_1.default.join(cwd, 'src', 'app');
    if (isDirectory(rootApp))
        return rootApp;
    if (isDirectory(srcApp))
        return srcApp;
    return null;
}
/**
 * True when the resolved app dir lives under `src/` (i.e. `src/app`).
 */
function isSrcAppLayout(cwd, appDir = resolveAppDir(cwd)) {
    const relative = path_1.default.relative(cwd, appDir).replace(/\\/g, '/');
    return relative === 'src/app' || relative.startsWith('src/app/');
}
/**
 * Shared UI directory paired with the app layout.
 * Prefers `src/components` for `src/app` projects, otherwise root `components/`.
 */
function resolveComponentsDir(cwd) {
    const appDir = resolveAppDirOrNull(cwd);
    const preferSrc = appDir ? isSrcAppLayout(cwd, appDir) : false;
    const srcComponents = path_1.default.join(cwd, 'src', 'components');
    const rootComponents = path_1.default.join(cwd, 'components');
    if (preferSrc) {
        if (isDirectory(srcComponents))
            return srcComponents;
        if (isDirectory(rootComponents))
            return rootComponents;
        return srcComponents;
    }
    if (isDirectory(rootComponents))
        return rootComponents;
    if (isDirectory(srcComponents))
        return srcComponents;
    return rootComponents;
}
function isDirectory(absolutePath) {
    try {
        return fs_1.default.existsSync(absolutePath) && fs_1.default.statSync(absolutePath).isDirectory();
    }
    catch {
        return false;
    }
}
