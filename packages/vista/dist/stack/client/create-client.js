"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVistaClient = createVistaClient;
const serialization_1 = require("../server/serialization");
const error_1 = require("./error");
function resolveFetchImpl(fetchImpl) {
    if (fetchImpl) {
        return fetchImpl;
    }
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is not available. Provide a fetch implementation via createVistaClient({ fetch }).');
    }
    return fetch;
}
function normalizeBaseUrl(baseUrl) {
    if (!baseUrl) {
        return '';
    }
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}
function normalizePath(path) {
    if (!path) {
        return '/';
    }
    return path.startsWith('/') ? path : `/${path}`;
}
function toQueryParams(input, serialization) {
    const params = new URLSearchParams();
    if (input === undefined || input === null) {
        return params;
    }
    const serializedInput = (0, serialization_1.serializeWithMode)(input, serialization);
    if (typeof serializedInput !== 'object' ||
        serializedInput === null ||
        Array.isArray(serializedInput)) {
        params.set('input', String(serializedInput));
        return params;
    }
    for (const [key, value] of Object.entries(serializedInput)) {
        if (value === undefined) {
            continue;
        }
        if (value === null) {
            params.set(key, 'null');
            continue;
        }
        if (Array.isArray(value)) {
            for (const entry of value) {
                params.append(key, typeof entry === 'object' ? JSON.stringify(entry) : String(entry));
            }
            continue;
        }
        if (typeof value === 'object') {
            params.set(key, JSON.stringify(value));
            continue;
        }
        params.set(key, String(value));
    }
    return params;
}
async function resolveHeaders(headers) {
    if (!headers) {
        return new Headers();
    }
    const value = typeof headers === 'function' ? await headers() : headers;
    return new Headers(value);
}
async function parseErrorResponse(response) {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        try {
            const json = await response.json();
            const message = (json && typeof json.error === 'string' && json.error) ||
                (json && typeof json.message === 'string' && json.message) ||
                response.statusText ||
                `Request failed with status ${response.status}`;
            return { message, details: json };
        }
        catch {
            // Fall through to text parsing.
        }
    }
    try {
        const text = await response.text();
        if (text) {
            return { message: text };
        }
    }
    catch {
        // ignore
    }
    return {
        message: response.statusText || `Request failed with status ${response.status}`,
    };
}
async function parseSuccessResponse(response, serialization) {
    if (response.status === 204) {
        return undefined;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
        return response.text();
    }
    const json = await response.json();
    return (0, serialization_1.deserializeWithMode)(json, serialization);
}
function buildRequestUrl(baseUrl, path, query) {
    const normalizedPath = normalizePath(path);
    const rawUrl = baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
    const queryString = query?.toString();
    if (!queryString) {
        return rawUrl;
    }
    return `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}${queryString}`;
}
async function requestRoute(options) {
    const requestHeaders = await resolveHeaders(options.headers);
    const normalizedPath = normalizePath(options.path);
    let url = buildRequestUrl(options.baseUrl, normalizedPath);
    const requestInit = {
        method: options.method,
        headers: requestHeaders,
    };
    if (options.method === 'GET') {
        const query = toQueryParams(options.input, options.serialization);
        url = buildRequestUrl(options.baseUrl, normalizedPath, query);
    }
    else {
        if (!requestHeaders.has('content-type')) {
            requestHeaders.set('content-type', 'application/json');
        }
        // Skip body serialization for inputless calls. serializeWithMode(undefined)
        // runs JSON.parse(JSON.stringify(undefined)) -> JSON.parse("undefined"),
        // which throws before the request is even sent. Explicit null still
        // serializes to "null" and normal payloads are unaffected.
        if (options.input !== undefined) {
            requestInit.body = JSON.stringify((0, serialization_1.serializeWithMode)(options.input, options.serialization));
        }
    }
    const response = await options.fetchImpl(url, requestInit);
    if (!response.ok) {
        const parsedError = await parseErrorResponse(response);
        throw new error_1.VistaClientError({
            status: response.status,
            message: parsedError.message,
            path: normalizedPath,
            method: options.method,
            url,
            response,
            details: parsedError.details,
        });
    }
    return (await parseSuccessResponse(response, options.serialization));
}
function assertPath(path) {
    if (!path || typeof path !== 'string') {
        throw new Error('Route path must be a non-empty string.');
    }
}
function createVistaClient(options = {}) {
    const fetchImpl = resolveFetchImpl(options.fetch);
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const serialization = options.serialization ?? 'json';
    function $url(path, ...args) {
        const routePath = String(path);
        assertPath(routePath);
        const query = toQueryParams(args[0], serialization);
        return buildRequestUrl(baseUrl, routePath, query);
    }
    async function $get(path, ...args) {
        const routePath = String(path);
        assertPath(routePath);
        return requestRoute({
            fetchImpl,
            method: 'GET',
            baseUrl,
            path: routePath,
            input: args[0],
            serialization,
            headers: options.headers,
        });
    }
    async function $post(path, ...args) {
        const routePath = String(path);
        assertPath(routePath);
        return requestRoute({
            fetchImpl,
            method: 'POST',
            baseUrl,
            path: routePath,
            input: args[0],
            serialization,
            headers: options.headers,
        });
    }
    return {
        $url,
        $get,
        $post,
    };
}
