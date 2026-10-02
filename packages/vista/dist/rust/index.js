"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nativeBindingsLoaded = nativeBindingsLoaded;
exports.classifyAppSegment = classifyAppSegment;
exports.routePattern = routePattern;
exports.encodeVistaErrorCode = encodeVistaErrorCode;
exports.findVistaErrorCodes = findVistaErrorCodes;
exports.tasklessSteps = tasklessSteps;
exports.classifyAppSegmentFallback = classifyAppSegmentFallback;
exports.routePatternFallback = routePatternFallback;
exports.readBoundPipeline = readBoundPipeline;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let native;
function loadNative() {
    if (native !== undefined)
        return native;
    const candidates = [
        path_1.default.resolve(__dirname, '../../../crates/vista-napi'),
        path_1.default.resolve(__dirname, '../../../../crates/vista-napi'),
        path_1.default.resolve(process.cwd(), 'crates/vista-napi'),
        path_1.default.resolve(process.cwd(), '../crates/vista-napi'),
    ];
    for (const candidate of candidates) {
        try {
            native = require(candidate);
            return native;
        }
        catch {
            // Try the next location. The TypeScript fallback stays correct either way.
        }
    }
    native = null;
    return null;
}
function nativeBindingsLoaded() {
    return loadNative() !== null;
}
function classifyAppSegment(folder) {
    const bound = loadNative();
    if (bound?.classifyAppSegmentInfo)
        return bound.classifyAppSegmentInfo(folder);
    return classifyAppSegmentFallback(folder);
}
function routePattern(folders) {
    const bound = loadNative();
    if (bound?.routePattern)
        return bound.routePattern(folders);
    return routePatternFallback(folders);
}
function isValidCode(code) {
    return code.length > 0 && /^[A-Z0-9_]+$/.test(code);
}
function encodeVistaErrorCode(code) {
    const bound = loadNative();
    if (bound?.encodeVistaErrorCode)
        return bound.encodeVistaErrorCode(code);
    if (code.startsWith('VISTA_') && isValidCode(code.slice('VISTA_'.length)))
        return code;
    return `VISTA_${code}`;
}
function findVistaErrorCodes(source) {
    const bound = loadNative();
    if (bound?.findVistaErrorCodes)
        return bound.findVistaErrorCodes(source);
    const found = [];
    const pattern = /VISTA_([A-Z0-9_]+)/g;
    for (const match of source.matchAll(pattern)) {
        if (!found.includes(match[1]))
            found.push(match[1]);
    }
    return found;
}
function tasklessSteps(enabled) {
    const bound = loadNative();
    if (bound?.tasklessSteps)
        return bound.tasklessSteps(enabled);
    return enabled ? ['scan', 'reuse-state', 'serve'] : ['scan', 'queue-work', 'serve'];
}
function classifyAppSegmentFallback(folder) {
    if (!folder)
        return { kind: 'static', segment: '' };
    if (folder.startsWith('(...)') ||
        folder.startsWith('(..)(..)') ||
        folder.startsWith('(..)') ||
        folder.startsWith('(.)')) {
        return { kind: 'interception', segment: folder };
    }
    if (folder.startsWith('(') && folder.endsWith(')') && folder.length >= 2) {
        return { kind: 'group', segment: folder.slice(1, -1) };
    }
    if (folder.startsWith('@') && folder.length > 1) {
        return { kind: 'parallel', segment: folder.slice(1) };
    }
    if (folder.startsWith('[[...') && folder.endsWith(']]') && folder.length > '[[...]]'.length) {
        return { kind: 'optional-catch-all', segment: folder.slice(5, -2) };
    }
    if (folder.startsWith('[...') && folder.endsWith(']') && folder.length > '[...]'.length) {
        return { kind: 'catch-all', segment: folder.slice(4, -1) };
    }
    if (folder.startsWith('[') && folder.endsWith(']') && folder.length >= 2) {
        return { kind: 'dynamic', segment: folder.slice(1, -1) };
    }
    return { kind: 'static', segment: folder };
}
function routePatternFallback(folders) {
    const parts = [];
    for (const folder of folders) {
        const classified = classifyAppSegmentFallback(folder);
        if (classified.kind === 'group' || classified.kind === 'parallel' || classified.kind === 'interception') {
            continue;
        }
        if (classified.kind === 'dynamic')
            parts.push(`:${classified.segment}`);
        else if (classified.kind === 'catch-all')
            parts.push(`:${classified.segment}*`);
        else if (classified.kind === 'optional-catch-all')
            parts.push(`:${classified.segment}*?`);
        else
            parts.push(classified.segment);
    }
    return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}
function readBoundPipeline(cwd = process.cwd()) {
    const file = path_1.default.join(cwd, '.flash', 'pipeline', 'bound.json');
    if (!fs_1.default.existsSync(file))
        return null;
    return JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
}
