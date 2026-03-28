"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWithRequestContext = runWithRequestContext;
exports.getRequestContext = getRequestContext;
exports.setCurrentSegmentConfig = setCurrentSegmentConfig;
exports.getCurrentSegmentConfig = getCurrentSegmentConfig;
exports.trackCacheTags = trackCacheTags;
exports.consumeTrackedTags = consumeTrackedTags;
exports.consumeRevalidatedTags = consumeRevalidatedTags;
exports.consumeRevalidatedPaths = consumeRevalidatedPaths;
exports.recordRevalidatedTag = recordRevalidatedTag;
exports.recordRevalidatedPath = recordRevalidatedPath;
const node_async_hooks_1 = require("node:async_hooks");
const requestContextStorage = new node_async_hooks_1.AsyncLocalStorage();
function createRequestContext(seed = {}) {
    return {
        req: seed.req,
        res: seed.res,
        cwd: seed.cwd,
        vistaDirRoot: seed.vistaDirRoot,
        urlPath: seed.urlPath,
        segmentConfig: seed.segmentConfig,
        usedTags: new Set(),
        revalidatedTags: new Set(),
        revalidatedPaths: new Set(),
    };
}
function runWithRequestContext(seed, callback) {
    return requestContextStorage.run(createRequestContext(seed), callback);
}
function getRequestContext() {
    return requestContextStorage.getStore();
}
function setCurrentSegmentConfig(segmentConfig) {
    const context = getRequestContext();
    if (context) {
        context.segmentConfig = segmentConfig;
    }
}
function getCurrentSegmentConfig() {
    return getRequestContext()?.segmentConfig;
}
function trackCacheTags(tags) {
    const context = getRequestContext();
    if (!context || !tags) {
        return;
    }
    for (const tag of tags) {
        const normalized = String(tag || '').trim();
        if (normalized) {
            context.usedTags.add(normalized);
        }
    }
}
function consumeTrackedTags() {
    const context = getRequestContext();
    if (!context || context.usedTags.size === 0) {
        return [];
    }
    const tags = Array.from(context.usedTags);
    context.usedTags.clear();
    return tags;
}
function consumeRevalidatedTags() {
    const context = getRequestContext();
    if (!context || context.revalidatedTags.size === 0) {
        return [];
    }
    const tags = Array.from(context.revalidatedTags);
    context.revalidatedTags.clear();
    return tags;
}
function consumeRevalidatedPaths() {
    const context = getRequestContext();
    if (!context || context.revalidatedPaths.size === 0) {
        return [];
    }
    const paths = Array.from(context.revalidatedPaths);
    context.revalidatedPaths.clear();
    return paths;
}
function recordRevalidatedTag(tag) {
    const context = getRequestContext();
    const normalized = String(tag || '').trim();
    if (context && normalized) {
        context.revalidatedTags.add(normalized);
    }
}
function recordRevalidatedPath(urlPath) {
    const context = getRequestContext();
    const normalized = String(urlPath || '').trim();
    if (context && normalized) {
        context.revalidatedPaths.add(normalized);
    }
}
