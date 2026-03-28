"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeReactClientReferenceManifest = normalizeReactClientReferenceManifest;
exports.normalizeReactServerConsumerManifest = normalizeReactServerConsumerManifest;
const fs_1 = __importDefault(require("fs"));
const url_1 = require("url");
function extractExportNames(source) {
    const exports = new Set();
    if (/export\s+default\s+/.test(source)) {
        exports.add('default');
    }
    const namedExportRegex = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
    let match;
    while ((match = namedExportRegex.exec(source)) !== null) {
        exports.add(match[1]);
    }
    const reExportRegex = /export\s+\{([^}]+)\}/g;
    while ((match = reExportRegex.exec(source)) !== null) {
        const names = match[1]
            .split(',')
            .map((entry) => entry
            .trim()
            .split(/\s+as\s+/)
            .pop()
            ?.trim())
            .filter(Boolean);
        for (const name of names) {
            exports.add(name);
        }
    }
    const commonJsExportRegex = /exports\.([A-Za-z_$][\w$]*)\s*=/g;
    while ((match = commonJsExportRegex.exec(source)) !== null) {
        if (match[1] !== '__esModule') {
            exports.add(match[1]);
        }
    }
    if (/module\.exports\s*=/.test(source) || /exports\.default\s*=/.test(source)) {
        exports.add('default');
    }
    return Array.from(exports);
}
function resolveManifestFilePath(specifier) {
    const baseSpecifier = specifier.split('#', 1)[0];
    if (!baseSpecifier.startsWith('file://')) {
        return null;
    }
    try {
        return (0, url_1.fileURLToPath)(baseSpecifier);
    }
    catch {
        try {
            return decodeURI(baseSpecifier
                .replace(/^file:\/\/\//, '')
                .replace(/^file:\/\//, ''));
        }
        catch {
            return null;
        }
    }
}
function addDriveLetterVariants(specifier, variants) {
    variants.add(specifier);
    const match = specifier.match(/^file:\/\/\/([A-Za-z]):/);
    if (!match) {
        return;
    }
    const lowerDrive = match[1].toLowerCase();
    const upperDrive = match[1].toUpperCase();
    variants.add(specifier.replace(/^file:\/\/\/([A-Za-z]):/, `file:///${lowerDrive}:`));
    variants.add(specifier.replace(/^file:\/\/\/([A-Za-z]):/, `file:///${upperDrive}:`));
}
function buildSpecifierVariants(specifier) {
    const baseSpecifier = specifier.split('#', 1)[0];
    const variants = new Set();
    addDriveLetterVariants(baseSpecifier, variants);
    if (baseSpecifier.startsWith('file://')) {
        try {
            addDriveLetterVariants(decodeURI(baseSpecifier), variants);
        }
        catch {
            // ignore decode failures
        }
        try {
            addDriveLetterVariants((0, url_1.pathToFileURL)((0, url_1.fileURLToPath)(baseSpecifier)).toString(), variants);
        }
        catch {
            // ignore encode failures
        }
    }
    return Array.from(variants);
}
function createAliasedEntry(entry, exportName) {
    if (exportName === '') {
        return {
            ...entry,
            name: '',
        };
    }
    return {
        ...entry,
        name: exportName,
    };
}
function normalizeReactClientReferenceManifest(input) {
    const manifest = { ...input };
    for (const [rawSpecifier, rawEntry] of Object.entries(input || {})) {
        if (!rawEntry || typeof rawEntry !== 'object') {
            continue;
        }
        const entry = {
            id: rawEntry.id,
            chunks: Array.isArray(rawEntry.chunks) ? rawEntry.chunks : [],
            name: rawEntry.name || '*',
        };
        const sourcePath = resolveManifestFilePath(rawSpecifier);
        const exportNames = new Set();
        if (entry.name && entry.name !== '*') {
            exportNames.add(entry.name);
        }
        if (sourcePath && fs_1.default.existsSync(sourcePath)) {
            try {
                const source = fs_1.default.readFileSync(sourcePath, 'utf-8');
                for (const exportName of extractExportNames(source)) {
                    exportNames.add(exportName);
                }
            }
            catch {
                // Keep manifest normalization resilient even if a source file disappears mid-build.
            }
        }
        for (const baseSpecifier of buildSpecifierVariants(rawSpecifier)) {
            if (!manifest[baseSpecifier]) {
                manifest[baseSpecifier] = entry;
            }
            const emptyExportKey = `${baseSpecifier}#`;
            if (!manifest[emptyExportKey]) {
                manifest[emptyExportKey] = createAliasedEntry(entry, '');
            }
            const defaultExportKey = `${baseSpecifier}#default`;
            if (!manifest[defaultExportKey]) {
                manifest[defaultExportKey] = createAliasedEntry(entry, 'default');
            }
            for (const exportName of exportNames) {
                const exportKey = `${baseSpecifier}#${exportName}`;
                if (!manifest[exportKey]) {
                    manifest[exportKey] = createAliasedEntry(entry, exportName);
                }
            }
        }
    }
    return manifest;
}
function normalizeReactServerConsumerManifest(input) {
    if (!input?.moduleMap) {
        return input;
    }
    for (const [moduleKey, rawExportsMap] of Object.entries(input.moduleMap)) {
        const normalizedExportsMap = {};
        const exportNames = new Set();
        let sourceSpecifier = null;
        let seedEntry = null;
        for (const [exportName, rawEntry] of Object.entries(rawExportsMap || {})) {
            const entry = {
                id: rawEntry?.id ?? rawEntry?.specifier ?? moduleKey,
                chunks: Array.isArray(rawEntry?.chunks) ? rawEntry.chunks : [],
                name: rawEntry?.name || exportName,
            };
            normalizedExportsMap[exportName] = entry;
            if (exportName !== '*') {
                exportNames.add(exportName);
            }
            if (entry.name && entry.name !== '*') {
                exportNames.add(entry.name);
            }
            if (!seedEntry) {
                seedEntry = entry;
            }
            if (!sourceSpecifier && typeof entry.id === 'string' && entry.id.startsWith('file://')) {
                sourceSpecifier = entry.id;
            }
            if (!sourceSpecifier && typeof rawEntry?.specifier === 'string' && rawEntry.specifier.startsWith('file://')) {
                sourceSpecifier = rawEntry.specifier;
            }
        }
        const sourcePath = sourceSpecifier ? resolveManifestFilePath(sourceSpecifier) : null;
        if (sourcePath && fs_1.default.existsSync(sourcePath)) {
            try {
                const source = fs_1.default.readFileSync(sourcePath, 'utf-8');
                for (const exportName of extractExportNames(source)) {
                    exportNames.add(exportName);
                }
            }
            catch {
                // Keep manifest normalization resilient even if the source file changes mid-build.
            }
        }
        if (seedEntry) {
            if (!normalizedExportsMap['*']) {
                normalizedExportsMap['*'] = {
                    ...seedEntry,
                    name: '*',
                };
            }
            for (const exportName of exportNames) {
                if (!normalizedExportsMap[exportName]) {
                    normalizedExportsMap[exportName] = {
                        ...seedEntry,
                        name: exportName,
                    };
                }
            }
        }
        input.moduleMap[moduleKey] = normalizedExportsMap;
    }
    return input;
}
