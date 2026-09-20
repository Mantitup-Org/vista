"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBootstrapChunkFile = isBootstrapChunkFile;
exports.sortHydrationChunkFiles = sortHydrationChunkFiles;
exports.listHydrationChunkFiles = listHydrationChunkFiles;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../constants");
const BOOTSTRAP_CHUNK_RE = /^(webpack|framework|vendor|main|runtime)(?:-[a-z0-9]+)?\.js$/i;
const BOOTSTRAP_PRIORITY = ['webpack', 'framework', 'vendor', 'runtime', 'main'];
function isBootstrapChunkFile(filename) {
    const base = filename.split(/[/\\]/).pop() || filename;
    return BOOTSTRAP_CHUNK_RE.test(base);
}
function bootstrapRank(filename) {
    const base = (filename.split(/[/\\]/).pop() || filename).replace(/(?:-[a-z0-9]+)?\.js$/i, '');
    const index = BOOTSTRAP_PRIORITY.indexOf(base.toLowerCase());
    return index === -1 ? BOOTSTRAP_PRIORITY.length : index;
}
function sortHydrationChunkFiles(files) {
    return [...files].sort((a, b) => {
        const rankDelta = bootstrapRank(a) - bootstrapRank(b);
        if (rankDelta !== 0)
            return rankDelta;
        return a.localeCompare(b);
    });
}
/**
 * Script tags that must be in the HTML document. Async `clientN-*.js`
 * chunks are loaded by the webpack runtime, matching Next.js.
 */
function listHydrationChunkFiles(cwd, isDev = false) {
    const chunksDir = path_1.default.join(cwd, constants_1.BUILD_DIR, 'static', 'chunks');
    if (!fs_1.default.existsSync(chunksDir))
        return [];
    const files = fs_1.default
        .readdirSync(chunksDir)
        .filter((name) => name.endsWith('.js') &&
        !name.endsWith('.map') &&
        !name.includes('.hot-update.') &&
        isBootstrapChunkFile(name));
    const normalizedFiles = isDev
        ? files.filter((name) => !/-[0-9a-f]{8,}\.js$/i.test(name))
        : files;
    return sortHydrationChunkFiles(normalizedFiles);
}
