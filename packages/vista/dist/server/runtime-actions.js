"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExportServerReferenceId = createExportServerReferenceId;
exports.createInlineServerActionId = createInlineServerActionId;
exports.registerInlineServerReference = registerInlineServerReference;
exports.registerServerActionModule = registerServerActionModule;
exports.resolveRegisteredServerReference = resolveRegisteredServerReference;
const url_1 = require("url");
const path_1 = __importDefault(require("path"));
const registeredReferences = new Map();
let cachedRegisterServerReference;
function getRegisterServerReference() {
    if (cachedRegisterServerReference !== undefined) {
        return cachedRegisterServerReference;
    }
    try {
        const runtime = require('react-server-dom-webpack/server.node');
        cachedRegisterServerReference =
            typeof runtime.registerServerReference === 'function'
                ? runtime.registerServerReference
                : null;
    }
    catch {
        cachedRegisterServerReference = null;
    }
    return cachedRegisterServerReference;
}
function normalizeExportName(exportName) {
    const value = String(exportName || 'default').trim();
    return value || 'default';
}
function normalizeHint(value) {
    return String(value || 'action')
        .trim()
        .replace(/[^a-zA-Z0-9_$]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'action';
}
function createStableFileUrl(filePath) {
    const href = (0, url_1.pathToFileURL)(path_1.default.resolve(filePath)).href;
    return href.replace(/^file:\/\/\/([A-Z]):/, (_match, driveLetter) => {
        return `file:///${driveLetter.toLowerCase()}:`;
    });
}
function createExportServerReferenceId(filePath, exportName = 'default') {
    return `${createStableFileUrl(filePath)}#${normalizeExportName(exportName)}`;
}
function createInlineServerActionId(filePath, ordinal, hint = 'action') {
    return `${createStableFileUrl(filePath)}#inline_${ordinal}_${normalizeHint(hint)}`;
}
function registerInlineServerReference(reference, id, exportName = 'default') {
    if (typeof reference !== 'function') {
        return reference;
    }
    const normalizedExportName = normalizeExportName(exportName);
    const registerServerReference = getRegisterServerReference();
    if (registerServerReference) {
        registerServerReference(reference, id, normalizedExportName);
    }
    registeredReferences.set(id, reference);
    return reference;
}
function registerServerActionModule(moduleExports, filePath) {
    if (!moduleExports || typeof moduleExports !== 'object') {
        return moduleExports;
    }
    const record = moduleExports;
    for (const [exportName, exportedValue] of Object.entries(record)) {
        if (typeof exportedValue !== 'function') {
            continue;
        }
        registerInlineServerReference(exportedValue, createExportServerReferenceId(filePath, exportName), exportName);
    }
    return moduleExports;
}
function resolveRegisteredServerReference(id) {
    return registeredReferences.get(id);
}
