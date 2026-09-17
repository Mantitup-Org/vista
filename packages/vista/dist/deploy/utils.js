"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATIC_HOST_ROUTE_RULES = void 0;
exports.ensureDir = ensureDir;
exports.copyDirectoryRecursive = copyDirectoryRecursive;
exports.copyFileIfPresent = copyFileIfPresent;
exports.writeFileIfAllowed = writeFileIfAllowed;
exports.readJsonSafe = readJsonSafe;
exports.copyStaticHostAssets = copyStaticHostAssets;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function ensureDir(absolutePath) {
    fs_1.default.mkdirSync(absolutePath, { recursive: true });
}
function copyDirectoryRecursive(sourceDir, targetDir) {
    if (!fs_1.default.existsSync(sourceDir))
        return;
    ensureDir(targetDir);
    const entries = fs_1.default.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const from = path_1.default.join(sourceDir, entry.name);
        const to = path_1.default.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(from, to);
        }
        else if (entry.isFile()) {
            fs_1.default.copyFileSync(from, to);
        }
    }
}
function copyFileIfPresent(sourceFile, targetFile) {
    if (!fs_1.default.existsSync(sourceFile))
        return;
    ensureDir(path_1.default.dirname(targetFile));
    fs_1.default.copyFileSync(sourceFile, targetFile);
}
function writeFileIfAllowed(targetFile, content, force) {
    if (fs_1.default.existsSync(targetFile) && !force) {
        return { written: false, skipped: true };
    }
    ensureDir(path_1.default.dirname(targetFile));
    fs_1.default.writeFileSync(targetFile, content, 'utf8');
    return { written: true, skipped: false };
}
function readJsonSafe(absolutePath) {
    try {
        return JSON.parse(fs_1.default.readFileSync(absolutePath, 'utf8'));
    }
    catch {
        return null;
    }
}
exports.STATIC_HOST_ROUTE_RULES = [
    { handle: 'filesystem' },
    { src: '^/_vista/(.*)$', dest: '/$1' },
    { src: '^/(?:rsc|_rsc)/?$', dest: '/static/pages/index.rsc' },
    { src: '^/(?:rsc|_rsc)/(.+)$', dest: '/static/pages/$1.rsc' },
    { src: '^/$', dest: '/static/pages/index.html' },
    { src: '^/(.+)$', dest: '/static/pages/$1.html' },
];
function copyStaticHostAssets(cwd, vistaDir, targetDir) {
    copyDirectoryRecursive(path_1.default.join(cwd, 'public'), targetDir);
    copyDirectoryRecursive(path_1.default.join(vistaDir, 'static'), path_1.default.join(targetDir, 'static'));
    const clientCssPath = path_1.default.join(vistaDir, 'client.css');
    copyFileIfPresent(clientCssPath, path_1.default.join(targetDir, 'client.css'));
    copyFileIfPresent(clientCssPath, path_1.default.join(targetDir, 'styles.css'));
}
