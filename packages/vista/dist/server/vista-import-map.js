"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveVistaSourceRequest = resolveVistaSourceRequest;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let nativeModule = null;
let nativeLoadAttempted = false;
function loadNativeModule() {
    if (nativeLoadAttempted) {
        return nativeModule;
    }
    nativeLoadAttempted = true;
    const possiblePaths = [
        path_1.default.resolve(__dirname, '../../../../crates/vista-napi'),
        path_1.default.resolve(__dirname, '../../../crates/vista-napi'),
        path_1.default.resolve(process.cwd(), '../crates/vista-napi'),
        '@aspect-build/vista-napi',
    ];
    for (const modulePath of possiblePaths) {
        try {
            nativeModule = require(modulePath);
            return nativeModule;
        }
        catch {
            // continue
        }
    }
    return null;
}
function resolveExistingModuleBase(candidateBase) {
    for (const extension of ['.js', '.ts', '.tsx', '.jsx']) {
        const absolutePath = `${candidateBase}${extension}`;
        if (fs_1.default.existsSync(absolutePath)) {
            return absolutePath;
        }
    }
    for (const extension of ['.js', '.ts', '.tsx', '.jsx']) {
        const indexPath = path_1.default.join(candidateBase, `index${extension}`);
        if (fs_1.default.existsSync(indexPath)) {
            return indexPath;
        }
    }
    return null;
}
function normalizeVistaRequest(request) {
    const normalizedRequest = request === '@vistagenic/vista'
        ? 'vista'
        : request.startsWith('@vistagenic/vista/')
            ? `vista/${request.slice('@vistagenic/vista/'.length)}`
            : request;
    if (normalizedRequest !== 'vista' && !normalizedRequest.startsWith('vista/')) {
        return null;
    }
    return normalizedRequest;
}
function resolveSourceCandidates(packageRoot, subpath) {
    if (subpath === '') {
        return [path_1.default.join(packageRoot, 'react-server'), path_1.default.join(packageRoot, 'index')];
    }
    const sourceMap = {
        link: [path_1.default.join(packageRoot, 'client', 'link')],
        image: [path_1.default.join(packageRoot, 'image', 'react-server'), path_1.default.join(packageRoot, 'image', 'index')],
        router: [path_1.default.join(packageRoot, 'client', 'router')],
        navigation: [path_1.default.join(packageRoot, 'client', 'navigation')],
        dynamic: [path_1.default.join(packageRoot, 'client', 'dynamic')],
        script: [path_1.default.join(packageRoot, 'client', 'script')],
        font: [path_1.default.join(packageRoot, 'font', 'index')],
        'font/google': [path_1.default.join(packageRoot, 'font', 'google')],
        'font/local': [path_1.default.join(packageRoot, 'font', 'local')],
        head: [path_1.default.join(packageRoot, 'client', 'head.react-server'), path_1.default.join(packageRoot, 'client', 'head')],
        config: [path_1.default.join(packageRoot, 'config')],
        stack: [path_1.default.join(packageRoot, 'stack', 'index')],
        'stack/client': [path_1.default.join(packageRoot, 'stack', 'client', 'index')],
        'client/rsc-router': [path_1.default.join(packageRoot, 'client', 'rsc-router')],
        'client/server-actions': [path_1.default.join(packageRoot, 'client', 'server-actions')],
        server: [path_1.default.join(packageRoot, 'server', 'index')],
        'server/runtime-actions': [path_1.default.join(packageRoot, 'server', 'runtime-actions')],
        cache: [path_1.default.join(packageRoot, 'server', 'cache')],
    };
    if (sourceMap[subpath]) {
        return sourceMap[subpath];
    }
    if (subpath.startsWith('server/')) {
        return [path_1.default.join(packageRoot, 'server', subpath.slice('server/'.length))];
    }
    if (subpath.startsWith('client/')) {
        return [path_1.default.join(packageRoot, 'client', subpath.slice('client/'.length))];
    }
    return [path_1.default.join(packageRoot, subpath)];
}
function resolveVistaSourceRequest(request, packageRoot) {
    const native = loadNativeModule();
    if (native?.resolveVistaSourceImport) {
        try {
            const nativeResolution = native.resolveVistaSourceImport(request, packageRoot);
            if (nativeResolution?.resolvedPath) {
                return nativeResolution.resolvedPath;
            }
            if (nativeResolution) {
                return null;
            }
        }
        catch {
            // fall through to JS fallback
        }
    }
    const normalizedRequest = normalizeVistaRequest(request);
    if (!normalizedRequest) {
        return null;
    }
    const subpath = normalizedRequest === 'vista' ? '' : normalizedRequest.slice('vista/'.length);
    const candidateBases = resolveSourceCandidates(packageRoot, subpath);
    for (const candidateBase of candidateBases) {
        const resolved = resolveExistingModuleBase(candidateBase);
        if (resolved) {
            return resolved;
        }
    }
    return null;
}
