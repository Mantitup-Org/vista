"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setServerReferenceRegistrar = setServerReferenceRegistrar;
exports.createExportServerReferenceId = createExportServerReferenceId;
exports.createInlineServerActionId = createInlineServerActionId;
exports.registerInlineServerReference = registerInlineServerReference;
exports.registerServerActionModule = registerServerActionModule;
exports.resolveRegisteredServerReference = resolveRegisteredServerReference;
exports.isServerReference = isServerReference;
const url_1 = require("url");
const path_1 = __importDefault(require("path"));
const SERVER_REFERENCE_TYPE = Symbol.for('react.server.reference');
const registeredReferences = new Map();
let injectedRegisterServerReference = null;
let cachedRegisterServerReference;
function getRegisterServerReference() {
    if (injectedRegisterServerReference) {
        return injectedRegisterServerReference;
    }
    if (cachedRegisterServerReference !== undefined) {
        return cachedRegisterServerReference;
    }
    try {
        const runtime = require('react-server-dom-webpack/server.node');
        if (typeof runtime.registerServerReference === 'function') {
            cachedRegisterServerReference = runtime.registerServerReference;
            return cachedRegisterServerReference;
        }
    }
    catch {
        // Requiring the Flight server entry can fail when `--conditions react-server`
        // is not active. Manual $$typeof stamping still lets functions serialize.
    }
    // Cache the negative result so the require() is attempted only once per process.
    cachedRegisterServerReference = null;
    return null;
}
function normalizeExportName(exportName) {
    const value = String(exportName || 'default').trim();
    return value || 'default';
}
function normalizeHint(value) {
    return (String(value || 'action')
        .trim()
        .replace(/[^a-zA-Z0-9_$]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'action');
}
function createStableFileUrl(filePath) {
    const href = (0, url_1.pathToFileURL)(path_1.default.resolve(filePath)).href;
    return href.replace(/^file:\/\/\/([A-Z]):/, (_match, driveLetter) => {
        return `file:///${driveLetter.toLowerCase()}:`;
    });
}
function stampServerReference(reference, id) {
    if (typeof reference !== 'function') {
        return reference;
    }
    try {
        Object.defineProperties(reference, {
            $$typeof: { value: SERVER_REFERENCE_TYPE },
            $$id: { value: id, configurable: true },
            $$bound: { value: null, configurable: true },
        });
    }
    catch {
        try {
            reference.$$typeof = SERVER_REFERENCE_TYPE;
            reference.$$id = id;
            reference.$$bound = null;
        }
        catch {
            // Ignore frozen functions; the registrar Map still keeps a callable.
        }
    }
    return reference;
}
function setServerReferenceRegistrar(fn) {
    injectedRegisterServerReference = fn;
}
function createExportServerReferenceId(filePath, exportName = 'default') {
    return `${createStableFileUrl(filePath)}#${normalizeExportName(exportName)}`;
}
function createInlineServerActionId(filePath, ordinal, hint = 'action') {
    return `${createStableFileUrl(filePath)}#inline_${ordinal}_${normalizeHint(hint)}`;
}
function registerInlineServerReference(reference, id, exportName = null) {
    if (typeof reference !== 'function') {
        return reference;
    }
    let tagged = reference;
    const registerServerReference = getRegisterServerReference();
    if (registerServerReference) {
        try {
            const registered = registerServerReference(reference, id, exportName);
            if (typeof registered === 'function') {
                tagged = registered;
            }
        }
        catch {
            // Fall through to manual stamping so Client Components can still receive the action.
        }
    }
    stampServerReference(tagged, id);
    registeredReferences.set(id, tagged);
    return tagged;
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
        const registered = registerInlineServerReference(exportedValue, createExportServerReferenceId(filePath, exportName), null);
        if (registered !== exportedValue) {
            record[exportName] = registered;
        }
    }
    return moduleExports;
}
function resolveRegisteredServerReference(id) {
    return registeredReferences.get(id);
}
function isServerReference(value) {
    return typeof value === 'function' && value.$$typeof === SERVER_REFERENCE_TYPE;
}
