"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unstable_cache = unstable_cache;
exports.cacheTag = cacheTag;
exports.cacheLife = cacheLife;
exports.wrapModuleUseCacheExport = wrapModuleUseCacheExport;
exports.revalidateTag = revalidateTag;
exports.revalidatePath = revalidatePath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const node_async_hooks_1 = require("node:async_hooks");
const static_cache_1 = require("./static-cache");
const request_context_1 = require("./request-context");
const functionCache = new Map();
const useCacheEntries = new Map();
const tagToFunctionKeys = new Map();
const tagToUseCacheKeys = new Map();
const useCacheScope = new node_async_hooks_1.AsyncLocalStorage();
const useCacheWrappedMarker = Symbol.for('vista.use-cache.wrapped');
function normalizeTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0) {
        return [];
    }
    return Array.from(new Set(tags
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)));
}
function addFunctionKeyToTagIndex(cacheKey, tags) {
    for (const tag of tags) {
        const keys = tagToFunctionKeys.get(tag) ?? new Set();
        keys.add(cacheKey);
        tagToFunctionKeys.set(tag, keys);
    }
}
function addUseCacheKeyToTagIndex(cacheKey, tags) {
    for (const tag of tags) {
        const keys = tagToUseCacheKeys.get(tag) ?? new Set();
        keys.add(cacheKey);
        tagToUseCacheKeys.set(tag, keys);
    }
}
function removeFunctionKeyFromTagIndex(cacheKey, tags) {
    for (const tag of tags) {
        const keys = tagToFunctionKeys.get(tag);
        if (!keys)
            continue;
        keys.delete(cacheKey);
        if (keys.size === 0) {
            tagToFunctionKeys.delete(tag);
        }
    }
}
function removeUseCacheKeyFromTagIndex(cacheKey, tags) {
    for (const tag of tags) {
        const keys = tagToUseCacheKeys.get(tag);
        if (!keys)
            continue;
        keys.delete(cacheKey);
        if (keys.size === 0) {
            tagToUseCacheKeys.delete(tag);
        }
    }
}
function isFresh(entry) {
    if (entry.revalidate === false) {
        return true;
    }
    const maxAgeMs = Math.max(0, entry.revalidate) * 1000;
    return Date.now() - entry.createdAt <= maxAgeMs;
}
function buildCacheKey(keyParts, args) {
    return JSON.stringify([keyParts, args]);
}
function buildUseCacheKey(filePath, exportName, args) {
    return JSON.stringify([
        'use-cache',
        filePath,
        exportName,
        args,
    ]);
}
function resolveStaticArtifactPaths(vistaDirRoot, urlPath) {
    const staticDir = path_1.default.join(vistaDirRoot, 'static', 'pages');
    const safePath = urlPath === '/' ? '/index' : urlPath;
    return ['.html', '.meta.json', '.rsc'].map((extension) => path_1.default.join(staticDir, `${safePath}${extension}`));
}
function removeStaticArtifacts(vistaDirRoot, urlPath) {
    if (!vistaDirRoot) {
        return;
    }
    for (const absolutePath of resolveStaticArtifactPaths(vistaDirRoot, urlPath)) {
        try {
            if (fs_1.default.existsSync(absolutePath)) {
                fs_1.default.unlinkSync(absolutePath);
            }
        }
        catch {
            // Ignore cache cleanup failures.
        }
    }
}
function unstable_cache(callback, keyParts = [], options = {}) {
    const normalizedTags = normalizeTags(options.tags);
    const normalizedKeyParts = keyParts.map((part) => String(part));
    const revalidate = options.revalidate === undefined ? false : options.revalidate;
    return async (...args) => {
        (0, request_context_1.trackCacheTags)(normalizedTags);
        const cacheKey = buildCacheKey(normalizedKeyParts, Array.from(args));
        const existing = functionCache.get(cacheKey);
        if (existing && isFresh(existing)) {
            return existing.value;
        }
        if (existing) {
            removeFunctionKeyFromTagIndex(cacheKey, existing.tags);
            functionCache.delete(cacheKey);
        }
        const value = await callback(...args);
        const entry = {
            createdAt: Date.now(),
            revalidate,
            tags: normalizedTags,
            value,
        };
        functionCache.set(cacheKey, entry);
        addFunctionKeyToTagIndex(cacheKey, normalizedTags);
        return value;
    };
}
function getUseCacheInvocationState() {
    return useCacheScope.getStore();
}
function cacheTag(...tags) {
    const normalizedTags = normalizeTags(tags);
    if (normalizedTags.length === 0) {
        return;
    }
    const scope = getUseCacheInvocationState();
    if (scope) {
        for (const tag of normalizedTags) {
            scope.tags.add(tag);
        }
    }
    (0, request_context_1.trackCacheTags)(normalizedTags);
}
function cacheLife(profile = false) {
    const scope = getUseCacheInvocationState();
    if (!scope) {
        return;
    }
    if (typeof profile === 'number' || profile === false) {
        scope.revalidate = profile;
        return;
    }
    if (profile && typeof profile === 'object') {
        if (profile.revalidate !== undefined) {
            scope.revalidate = profile.revalidate;
        }
        if (Array.isArray(profile.tags)) {
            for (const tag of normalizeTags(profile.tags)) {
                scope.tags.add(tag);
            }
        }
    }
}
function createUseCacheInvocationState() {
    return {
        revalidate: false,
        tags: new Set(),
    };
}
function finalizeUseCacheEntry(cacheKey, state, value) {
    const tags = normalizeTags(Array.from(state.tags));
    const entry = {
        createdAt: Date.now(),
        revalidate: state.revalidate,
        tags,
        value,
    };
    const existing = useCacheEntries.get(cacheKey);
    if (existing) {
        removeUseCacheKeyFromTagIndex(cacheKey, existing.tags);
    }
    useCacheEntries.set(cacheKey, entry);
    addUseCacheKeyToTagIndex(cacheKey, tags);
    (0, request_context_1.trackCacheTags)(tags);
    return value;
}
function wrapModuleUseCacheExport(value, filePath, exportName) {
    if (typeof value !== 'function') {
        return value;
    }
    const original = value;
    if (original[useCacheWrappedMarker]) {
        return value;
    }
    const wrapped = function vistaUseCacheWrapped(...args) {
        const cacheKey = buildUseCacheKey(filePath, exportName, args);
        const existing = useCacheEntries.get(cacheKey);
        if (existing && isFresh(existing)) {
            (0, request_context_1.trackCacheTags)(existing.tags);
            return existing.value;
        }
        if (existing) {
            removeUseCacheKeyFromTagIndex(cacheKey, existing.tags);
            useCacheEntries.delete(cacheKey);
        }
        const invoke = () => original.apply(this, args);
        const state = createUseCacheInvocationState();
        return useCacheScope.run(state, () => {
            const result = invoke();
            if (result && typeof result.then === 'function') {
                return result.then((resolved) => finalizeUseCacheEntry(cacheKey, state, resolved));
            }
            return finalizeUseCacheEntry(cacheKey, state, result);
        });
    };
    Object.defineProperty(wrapped, useCacheWrappedMarker, {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false,
    });
    Object.defineProperty(wrapped, 'name', {
        value: original.name || exportName || 'vistaUseCacheWrapped',
        configurable: true,
    });
    return wrapped;
}
function revalidateTag(tag) {
    const normalized = String(tag || '').trim();
    if (!normalized) {
        return;
    }
    const functionKeys = Array.from(tagToFunctionKeys.get(normalized) ?? []);
    for (const cacheKey of functionKeys) {
        const entry = functionCache.get(cacheKey);
        if (entry) {
            removeFunctionKeyFromTagIndex(cacheKey, entry.tags);
        }
        functionCache.delete(cacheKey);
    }
    tagToFunctionKeys.delete(normalized);
    const useCacheKeys = Array.from(tagToUseCacheKeys.get(normalized) ?? []);
    for (const cacheKey of useCacheKeys) {
        const entry = useCacheEntries.get(cacheKey);
        if (entry) {
            removeUseCacheKeyFromTagIndex(cacheKey, entry.tags);
        }
        useCacheEntries.delete(cacheKey);
    }
    tagToUseCacheKeys.delete(normalized);
    const context = (0, request_context_1.getRequestContext)();
    const affectedPaths = (0, static_cache_1.invalidateCachedPagesByTag)(normalized);
    for (const urlPath of affectedPaths) {
        removeStaticArtifacts(context?.vistaDirRoot, urlPath);
    }
    (0, request_context_1.recordRevalidatedTag)(normalized);
}
function revalidatePath(urlPath) {
    const normalized = String(urlPath || '').trim();
    if (!normalized) {
        return;
    }
    (0, static_cache_1.invalidateCachedPage)(normalized);
    removeStaticArtifacts((0, request_context_1.getRequestContext)()?.vistaDirRoot, normalized);
    (0, request_context_1.recordRevalidatedPath)(normalized);
}
