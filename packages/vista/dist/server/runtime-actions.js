"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_REFERENCE_TAG = void 0;
exports.createExportServerReferenceId = createExportServerReferenceId;
exports.createInlineServerActionId = createInlineServerActionId;
exports.setRegisterServerReference = setRegisterServerReference;
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
exports.SERVER_REFERENCE_TAG = Symbol.for('react.server.reference');
function setRegisterServerReference(fn) {
    cachedRegisterServerReference = fn;
}
function registerInlineServerReference(reference, id, exportName = 'default') {
    if (typeof reference !== 'function') {
        return reference;
    }
    const normalizedExportName = normalizeExportName(exportName);
    const registerServerReference = getRegisterServerReference();
    if (registerServerReference) {
        try {
            registerServerReference(reference, id, normalizedExportName);
        }
        catch {
            // Fallback manual registration below
        }
    }
    // Ensure React Server Components serializer recognizes the reference as a valid Server Reference
    const targetId = normalizedExportName === 'default' ? id : `${id}#${normalizedExportName}`;
    const funcObj = reference;
    if (funcObj.$$typeof !== exports.SERVER_REFERENCE_TAG) {
        try {
            Object.defineProperties(reference, {
                $$typeof: { value: exports.SERVER_REFERENCE_TAG, configurable: true, enumerable: false },
                $$id: { value: targetId, configurable: true, enumerable: true },
                $$bound: { value: funcObj.$$bound ?? null, configurable: true, enumerable: false },
                $$location: {
                    value: funcObj.$$location ?? Error('react-server-action-frame'),
                    configurable: true,
                    enumerable: false,
                },
            });
        }
        catch {
            funcObj.$$typeof = exports.SERVER_REFERENCE_TAG;
            funcObj.$$id = targetId;
            funcObj.$$bound = funcObj.$$bound ?? null;
        }
    }
    registeredReferences.set(id, reference);
    if (targetId !== id) {
        registeredReferences.set(targetId, reference);
    }
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
