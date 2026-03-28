"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installSegmentFetchPolicyShim = installSegmentFetchPolicyShim;
exports.clearSegmentFetchCache = clearSegmentFetchCache;
const request_context_1 = require("./request-context");
const fetchResponseCache = new Map();
let installed = false;
function createCacheKey(input, init) {
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
        return null;
    }
    const url = typeof input === 'string'
        ? input
        : input instanceof URL
            ? input.toString()
            : input.url;
    return JSON.stringify({
        method,
        url,
        cache: init?.cache || null,
        headers: init?.headers || null,
    });
}
function cloneCachedResponse(entry) {
    return new Response(entry.body.slice(), {
        status: entry.status,
        statusText: entry.statusText,
        headers: entry.headers,
    });
}
function shouldCacheResponse(policy, init) {
    if (policy === 'force-no-store' || policy === 'only-no-store' || policy === 'default-no-store') {
        return false;
    }
    if (init?.cache === 'no-store') {
        return false;
    }
    return policy === 'force-cache' || policy === 'only-cache' || policy === 'default-cache';
}
function applyFetchPolicy(policy, init, input) {
    const nextInit = {
        ...(init || {}),
        headers: init?.headers,
    };
    if (policy === 'force-no-store') {
        nextInit.cache = 'no-store';
        return nextInit;
    }
    if (policy === 'default-no-store' && !nextInit.cache) {
        nextInit.cache = 'no-store';
        return nextInit;
    }
    if (policy === 'only-no-store') {
        if (nextInit.cache && nextInit.cache !== 'no-store') {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;
            throw new Error(`cache: '${nextInit.cache}' used on fetch for ${url} with export const fetchCache = 'only-no-store'`);
        }
        nextInit.cache = 'no-store';
        return nextInit;
    }
    if (policy === 'force-cache') {
        nextInit.cache = 'force-cache';
        return nextInit;
    }
    if (policy === 'default-cache' && !nextInit.cache) {
        nextInit.cache = 'force-cache';
        return nextInit;
    }
    if (policy === 'only-cache') {
        if (nextInit.cache === 'no-store') {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;
            throw new Error(`cache: 'no-store' used on fetch for ${url} with export const fetchCache = 'only-cache'`);
        }
        if (!nextInit.cache) {
            nextInit.cache = 'force-cache';
        }
    }
    return nextInit;
}
function installSegmentFetchPolicyShim() {
    if (installed || typeof globalThis.fetch !== 'function') {
        return;
    }
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
        const policy = (0, request_context_1.getCurrentSegmentConfig)()?.fetchCache ?? 'auto';
        const normalizedInit = applyFetchPolicy(policy, init, input);
        const cacheKey = shouldCacheResponse(policy, normalizedInit)
            ? createCacheKey(input, normalizedInit)
            : null;
        if (cacheKey) {
            const cachedResponse = fetchResponseCache.get(cacheKey);
            if (cachedResponse) {
                return cloneCachedResponse(cachedResponse);
            }
        }
        const response = await originalFetch(input, normalizedInit);
        if (cacheKey) {
            const clonedResponse = response.clone();
            const bodyBytes = new Uint8Array(await clonedResponse.arrayBuffer());
            fetchResponseCache.set(cacheKey, {
                body: bodyBytes,
                headers: Array.from(clonedResponse.headers.entries()),
                status: clonedResponse.status,
                statusText: clonedResponse.statusText,
            });
        }
        return response;
    };
    installed = true;
}
function clearSegmentFetchCache() {
    fetchResponseCache.clear();
}
