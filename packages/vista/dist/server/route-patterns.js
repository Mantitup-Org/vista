"use strict";
/**
 * Route pattern parsing and matching for file-based API route handlers.
 *
 * Shared by the build-time scanner (packages/vista/src/build/rsc/server-manifest.ts)
 * and the request-time resolver (packages/vista/src/server/typed-api-runtime.ts) so
 * both sides agree on what `app/api/users/[id]/route.ts` means.
 *
 * Patterns use the same `:name` / `:name*` shape the page router already emits, so
 * `toRegexFromPattern()` in build/manifest.ts consumes them unchanged.
 *
 * This module is intentionally filesystem-free and framework-free: it is pure string
 * work, which keeps it cheap to call per request and straightforward to test.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRouteGroupSegment = isRouteGroupSegment;
exports.isParallelRouteSegment = isParallelRouteSegment;
exports.isInterceptionRouteSegment = isInterceptionRouteSegment;
exports.parseRouteSegments = parseRouteSegments;
exports.splitRequestPath = splitRequestPath;
exports.matchRouteSegments = matchRouteSegments;
exports.compareRouteSpecificity = compareRouteSpecificity;
/** `(marketing)` - grouping only, contributes nothing to the URL. */
function isRouteGroupSegment(segment) {
    return segment.length > 2 && segment.startsWith('(') && segment.endsWith(')');
}
/** `@modal` - parallel route slot. Not addressable as an API route. */
function isParallelRouteSegment(segment) {
    return segment.startsWith('@');
}
/** `(.)photo`, `(..)feed`, `(...)root` - interception routes. Not addressable either. */
function isInterceptionRouteSegment(segment) {
    return /^\(\.{1,3}\)/.test(segment) || segment.startsWith('(..)(..)');
}
function parseSegment(segment) {
    // [[...slug]] - optional catch-all, also matches the parent path.
    const optionalCatchAll = /^\[\[\.\.\.([^\]]+)\]\]$/.exec(segment);
    if (optionalCatchAll) {
        return { kind: 'catch-all', paramName: optionalCatchAll[1], optional: true };
    }
    // [...slug] - catch-all, requires at least one segment.
    const catchAll = /^\[\.\.\.([^\]]+)\]$/.exec(segment);
    if (catchAll) {
        return { kind: 'catch-all', paramName: catchAll[1], optional: false };
    }
    // [id] - single dynamic segment.
    const dynamic = /^\[([^\].]+)\]$/.exec(segment);
    if (dynamic) {
        return { kind: 'dynamic', paramName: dynamic[1] };
    }
    return { kind: 'static', value: segment };
}
function segmentToPatternPart(segment) {
    switch (segment.kind) {
        case 'static':
            return segment.value;
        case 'dynamic':
            return `:${segment.paramName}`;
        case 'catch-all':
            return `:${segment.paramName}*${segment.optional ? '?' : ''}`;
    }
}
/**
 * Turn filesystem segments (relative to `app/`) into a parsed route.
 *
 * Returns null when the path is not addressable as a URL - a parallel slot or an
 * interception route. Route groups are dropped from the pattern but do not
 * disqualify the route.
 */
function parseRouteSegments(sourceSegments) {
    const segments = [];
    for (const rawSegment of sourceSegments) {
        if (!rawSegment)
            continue;
        if (isParallelRouteSegment(rawSegment) || isInterceptionRouteSegment(rawSegment)) {
            return null;
        }
        if (isRouteGroupSegment(rawSegment)) {
            continue;
        }
        segments.push(parseSegment(rawSegment));
    }
    const hasCatchAll = segments.some((segment) => segment.kind === 'catch-all');
    const hasDynamic = segments.some((segment) => segment.kind === 'dynamic');
    const type = hasCatchAll ? 'catch-all' : hasDynamic ? 'dynamic' : 'static';
    const pattern = segments.length === 0 ? '/' : `/${segments.map(segmentToPatternPart).join('/')}`;
    return { pattern, segments, type };
}
/** Split a request pathname into segments, ignoring query string and trailing slash. */
function splitRequestPath(requestPath) {
    return String(requestPath || '/')
        .split('?')[0]
        .split('#')[0]
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .map((segment) => {
        try {
            return decodeURIComponent(segment);
        }
        catch {
            // A malformed escape sequence is matched literally rather than throwing.
            return segment;
        }
    });
}
/**
 * Match a parsed route against request path segments.
 *
 * Returns the extracted params, or null when the route does not match. A catch-all
 * param is returned as a string array, mirroring the App Router's shape.
 */
function matchRouteSegments(route, requestSegments) {
    const params = {};
    const { segments } = route;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (segment.kind === 'catch-all') {
            // A catch-all must be the final segment, and swallows everything left.
            const rest = requestSegments.slice(index);
            if (rest.length === 0) {
                if (!segment.optional) {
                    return null;
                }
                params[segment.paramName] = [];
                return params;
            }
            params[segment.paramName] = rest;
            return params;
        }
        const requestSegment = requestSegments[index];
        if (requestSegment === undefined) {
            return null;
        }
        if (segment.kind === 'static') {
            if (segment.value !== requestSegment) {
                return null;
            }
            continue;
        }
        // Dynamic segments must not match an empty value.
        if (requestSegment === '') {
            return null;
        }
        params[segment.paramName] = requestSegment;
    }
    // Every request segment has to be consumed, otherwise `/a` would match `/a/b`.
    if (requestSegments.length !== segments.length) {
        return null;
    }
    return params;
}
/**
 * Ordering for route resolution: the most specific route wins.
 *
 * Static beats dynamic beats catch-all, compared segment by segment, so
 * `/api/users/me` is preferred over `/api/users/[id]`, which is preferred over
 * `/api/users/[...rest]`. Ties fall back to the pattern string for stable,
 * platform-independent ordering.
 */
function compareRouteSpecificity(a, b) {
    const rank = (segment) => {
        switch (segment.kind) {
            case 'static':
                return 0;
            case 'dynamic':
                return 1;
            case 'catch-all':
                return 2;
        }
    };
    const length = Math.max(a.segments.length, b.segments.length);
    for (let index = 0; index < length; index += 1) {
        const segmentA = a.segments[index];
        const segmentB = b.segments[index];
        if (!segmentA)
            return -1;
        if (!segmentB)
            return 1;
        const difference = rank(segmentA) - rank(segmentB);
        if (difference !== 0) {
            return difference;
        }
    }
    return a.pattern.localeCompare(b.pattern);
}
