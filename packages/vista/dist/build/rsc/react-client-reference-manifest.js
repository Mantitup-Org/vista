"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveReactClientManifestEntry = resolveReactClientManifestEntry;
exports.normalizeReactClientReferenceManifest = normalizeReactClientReferenceManifest;
exports.normalizeReactServerConsumerManifest = normalizeReactServerConsumerManifest;
exports.createGuardedReactClientManifest = createGuardedReactClientManifest;
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
function addStandalonePathVariants(specifier, variants) {
    addDriveLetterVariants(specifier, variants);
    const standaloneProject = '/.vista/standalone/project';
    const standaloneRuntime = '/.vista/standalone/runtime';
    if (specifier.includes(standaloneProject)) {
        addDriveLetterVariants(specifier.split(standaloneProject).join(''), variants);
    }
    if (specifier.includes(standaloneRuntime)) {
        addDriveLetterVariants(specifier.split(standaloneRuntime).join(''), variants);
    }
    if (!specifier.includes('/.vista/standalone/') && specifier.startsWith('file://')) {
        const inserted = specifier.replace(/^(file:\/\/\/(?:[A-Za-z]:)?(?:\/[^/]+)*)(\/(?:app|components|utils|lib|src|content|hooks)\/)/i, `$1${standaloneProject}$2`);
        if (inserted !== specifier) {
            addDriveLetterVariants(inserted, variants);
        }
    }
}
function buildSpecifierVariants(specifier) {
    const baseSpecifier = specifier.split('#', 1)[0];
    const variants = new Set();
    addStandalonePathVariants(baseSpecifier, variants);
    if (baseSpecifier.startsWith('file://')) {
        try {
            addStandalonePathVariants(decodeURI(baseSpecifier), variants);
        }
        catch {
            // ignore decode failures
        }
        try {
            addStandalonePathVariants((0, url_1.pathToFileURL)((0, url_1.fileURLToPath)(baseSpecifier)).toString(), variants);
        }
        catch {
            // ignore encode failures
        }
    }
    return Array.from(variants);
}
function splitManifestKey(key) {
    const hashIdx = key.lastIndexOf('#');
    if (hashIdx <= 0) {
        return { specifier: key, exportName: null };
    }
    return {
        specifier: key.slice(0, hashIdx),
        exportName: key.slice(hashIdx + 1),
    };
}
function normalizeManifestSpecifier(specifier) {
    return specifier
        .replace(/\\/g, '/')
        .replace(/^file:\/\//i, '')
        .replace(/^\/+/, '')
        .replace(/\/\.vista\/standalone\/(?:project|runtime)/gi, '')
        .toLowerCase();
}
function relativeClientPath(normalized) {
    const markers = [
        '/app/',
        '/components/',
        '/utils/',
        '/lib/',
        '/src/',
        '/content/',
        '/hooks/',
        '/packages/vista/',
    ];
    let best = normalized;
    for (const marker of markers) {
        const idx = normalized.lastIndexOf(marker);
        if (idx !== -1) {
            const sliced = normalized.slice(idx);
            if (sliced.length <= best.length) {
                best = sliced;
            }
        }
    }
    return best.replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/i, '');
}
function exportNamesCompatible(requested, existing) {
    if (requested === null || existing === null)
        return true;
    if (requested === existing)
        return true;
    const aliases = new Set(['', '*', 'default']);
    return aliases.has(requested) && aliases.has(existing);
}
/**
 * Flight encode looks up `file://...#ExportName`. Webpack may have keyed the
 * same module under a standalone copy, a different drive-letter case, or a
 * slightly different absolute prefix. Resolve those aliases at lookup time so
 * missing keys do not serialize as Flight `E{"digest":""}` rows.
 */
function resolveReactClientManifestEntry(manifest, key) {
    if (Object.prototype.hasOwnProperty.call(manifest, key)) {
        return manifest[key];
    }
    const { specifier, exportName } = splitManifestKey(key);
    const candidates = [];
    for (const variant of buildSpecifierVariants(specifier)) {
        candidates.push(variant);
        if (exportName !== null) {
            candidates.push(`${variant}#${exportName}`);
            candidates.push(`${variant}#`);
            candidates.push(`${variant}#default`);
            candidates.push(`${variant}#*`);
        }
    }
    for (const candidate of candidates) {
        if (Object.prototype.hasOwnProperty.call(manifest, candidate)) {
            return manifest[candidate];
        }
    }
    const needle = normalizeManifestSpecifier(specifier);
    const needleFile = needle.split('/').pop() || needle;
    let fuzzy;
    for (const [existingKey, entry] of Object.entries(manifest)) {
        if (!entry || typeof entry !== 'object')
            continue;
        const existing = splitManifestKey(existingKey);
        const existingNorm = normalizeManifestSpecifier(existing.specifier);
        const existingFile = existingNorm.split('/').pop() || existingNorm;
        const existingStem = existingFile.replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/i, '');
        const needleStem = needleFile.replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/i, '');
        const genericStem = existingStem === 'index' || existingStem === 'page' || existingStem === 'layout';
        const pathMatches = existingNorm === needle ||
            relativeClientPath(existingNorm) === relativeClientPath(needle) ||
            (Boolean(needleFile) && !genericStem && existingStem === needleStem);
        if (!pathMatches || !exportNamesCompatible(exportName, existing.exportName)) {
            continue;
        }
        if (existing.exportName === exportName) {
            return entry;
        }
        fuzzy = entry;
    }
    return fuzzy;
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
/**
 * React looks up `file://...#ExportName` in the Flight manifest and throws a
 * generic error when the key is missing. Wrap the manifest so the message names
 * the file and the scan-directory requirement.
 */
function createGuardedReactClientManifest(manifest) {
    return new Proxy(manifest, {
        get(target, prop, receiver) {
            if (typeof prop === 'string' && (prop.startsWith('file:') || prop.includes('#'))) {
                const resolved = resolveReactClientManifestEntry(target, prop);
                if (resolved) {
                    return resolved;
                }
                const fileHint = prop.split('#')[0];
                throw new Error(`Could not find the module "${prop}" in the React Client Manifest. ` +
                    `Client Components need a 'use client' directive and must live under a scanned project directory ` +
                    `(app/, components/, utils/, lib/, src/, ...). Missing: ${fileHint}`);
            }
            return Reflect.get(target, prop, receiver);
        },
        has(target, prop) {
            if (typeof prop === 'string' && (prop.startsWith('file:') || prop.includes('#'))) {
                return Boolean(resolveReactClientManifestEntry(target, prop));
            }
            return Reflect.has(target, prop);
        },
    });
}
