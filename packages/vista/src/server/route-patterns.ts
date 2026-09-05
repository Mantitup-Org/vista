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

/** A single parsed path segment of a route. */
export type RouteSegment =
  | { kind: 'static'; value: string }
  | { kind: 'dynamic'; paramName: string }
  | { kind: 'catch-all'; paramName: string; optional: boolean };

export type RouteSegmentType = 'static' | 'dynamic' | 'catch-all';

export interface ParsedRoute {
  /** URL pattern, e.g. `/api/users/:id` or `/api/files/:path*`. */
  pattern: string;
  /** Parsed segments in order, route groups already removed. */
  segments: RouteSegment[];
  /** Coarse route shape, matching the vocabulary the page router uses. */
  type: RouteSegmentType;
}

export type RouteParams = Record<string, string | string[]>;

/** `(marketing)` - grouping only, contributes nothing to the URL. */
export function isRouteGroupSegment(segment: string): boolean {
  return segment.length > 2 && segment.startsWith('(') && segment.endsWith(')');
}

/** `@modal` - parallel route slot. Not addressable as an API route. */
export function isParallelRouteSegment(segment: string): boolean {
  return segment.startsWith('@');
}

/** `(.)photo`, `(..)feed`, `(...)root` - interception routes. Not addressable either. */
export function isInterceptionRouteSegment(segment: string): boolean {
  return /^\(\.{1,3}\)/.test(segment) || segment.startsWith('(..)(..)');
}

function parseSegment(segment: string): RouteSegment {
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

function segmentToPatternPart(segment: RouteSegment): string {
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
export function parseRouteSegments(sourceSegments: string[]): ParsedRoute | null {
  const segments: RouteSegment[] = [];

  for (const rawSegment of sourceSegments) {
    if (!rawSegment) continue;
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
  const type: RouteSegmentType = hasCatchAll ? 'catch-all' : hasDynamic ? 'dynamic' : 'static';

  const pattern = segments.length === 0 ? '/' : `/${segments.map(segmentToPatternPart).join('/')}`;

  return { pattern, segments, type };
}

/** Split a request pathname into segments, ignoring query string and trailing slash. */
export function splitRequestPath(requestPath: string): string[] {
  return String(requestPath || '/')
    .split('?')[0]
    .split('#')[0]
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
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
export function matchRouteSegments(
  route: ParsedRoute,
  requestSegments: string[]
): RouteParams | null {
  const params: RouteParams = {};
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
export function compareRouteSpecificity(a: ParsedRoute, b: ParsedRoute): number {
  const rank = (segment: RouteSegment): number => {
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
    if (!segmentA) return -1;
    if (!segmentB) return 1;

    const difference = rank(segmentA) - rank(segmentB);
    if (difference !== 0) {
      return difference;
    }
  }

  return a.pattern.localeCompare(b.pattern);
}
