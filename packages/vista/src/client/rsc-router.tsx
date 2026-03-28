/**
 * Vista RSC Client Router
 *
 * Holds the current Flight response as React state and swaps it on
 * navigation by fetching a new Flight stream from /rsc{pathname}.
 *
 * Navigation is wrapped in React.startTransition so React can
 * show the old UI while the new Flight payload loads (matching
 * Next.js App Router behavior).
 */

'use client';

import * as React from 'react';

/**
 * A thenable that React.use() can consume.
 * React 19 defines this internally but doesn't export it from @types/react,
 * so we provide a compatible definition here.
 */
type Thenable<T> = Promise<T> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
};

// Re-use the createFromFetch from the webpack Flight client.
// At runtime, this module is bundled by webpack and available
// in the client bundle.  We import it lazily so the module is
// only required in an RSC-enabled build.
type CreateFromFetch = (
  fetchPromise: Promise<Response>,
  options?: { callServer?: (id: string, args: unknown[]) => unknown }
) => Thenable<React.ReactNode>;

let _createFromFetch: CreateFromFetch | null = null;

function getCreateFromFetch(): CreateFromFetch {
  if (!_createFromFetch) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _createFromFetch = require('react-server-dom-webpack/client')
      .createFromFetch as CreateFromFetch;
  }
  return _createFromFetch;
}

// ---------------------------------------------------------------------------
// Navigation context (shared between RSCRouter, Link, and navigation hooks)
// ---------------------------------------------------------------------------

export interface RSCNavigationState {
  pathname: string;
  searchParams: URLSearchParams;
  /** Push a new Flight navigation */
  push: (url: string, options?: NavigationOptions) => void;
  /** Replace the current entry */
  replace: (url: string, options?: NavigationOptions) => void;
  back: () => void;
  forward: () => void;
  /** Pre-fetch the Flight stream for a URL */
  prefetch: (url: string) => void;
  /** Re-fetch the current page from the server */
  refresh: () => void;
  /** Whether a navigation is in progress (inside startTransition) */
  isPending: boolean;
}

export interface NavigationOptions {
  scroll?: boolean;
}

declare global {
  interface Window {
    __VISTA_RUNTIME_TRACE__?: {
      events: Array<{
        type: string;
        detail: Record<string, unknown>;
        at: number;
      }>;
      lastEvent: {
        type: string;
        detail: Record<string, unknown>;
        at: number;
      } | null;
      pushEvent: (type: string, detail?: Record<string, unknown>) => {
        type: string;
        detail: Record<string, unknown>;
        at: number;
      };
    };
    __VISTA_RSC_ROUTER__?: {
      refresh: () => void;
      prefetch: (url: string) => void;
      resume: (url: string) => void;
      getState: () => {
        pathname: string;
        search: string;
        isPending: boolean;
      };
    };
  }
}

function ensureRuntimeTraceStore() {
  if (typeof window === 'undefined') {
    return null;
  }

  const existing = window.__VISTA_RUNTIME_TRACE__;
  if (existing && typeof existing.pushEvent === 'function' && Array.isArray(existing.events)) {
    return existing;
  }

  const store = {
    events: [] as Array<{
      type: string;
      detail: Record<string, unknown>;
      at: number;
    }>,
    lastEvent: null as {
      type: string;
      detail: Record<string, unknown>;
      at: number;
    } | null,
    pushEvent(type: string, detail: Record<string, unknown> = {}) {
      const entry = {
        type,
        detail,
        at: Date.now(),
      };
      store.events.push(entry);
      if (store.events.length > 60) {
        store.events.shift();
      }
      store.lastEvent = entry;
      return entry;
    },
  };

  window.__VISTA_RUNTIME_TRACE__ = store;
  return store;
}

function recordRuntimeTrace(type: string, detail: Record<string, unknown> = {}) {
  return ensureRuntimeTraceStore()?.pushEvent(type, detail) ?? null;
}

function dispatchRuntimeEvent(type: string, detail: Record<string, unknown> = {}) {
  if (typeof document === 'undefined') {
    return;
  }

  document.dispatchEvent(new CustomEvent(type, { detail }));
}

export const RSCRouterContext = React.createContext<RSCNavigationState | null>(null);

// ---------------------------------------------------------------------------
// Flight cache — simple in-memory LRU cache keyed by pathname+search
// ---------------------------------------------------------------------------

const CACHE_MAX = 50;
const flightCache = new Map<string, Thenable<React.ReactNode>>();

function cacheKey(pathname: string, search: string): string {
  return pathname + search;
}

// Import callServer lazily to avoid circular dependency issues
let _callServer: ((id: string, args: unknown[]) => Promise<unknown>) | null = null;

function getCallServer(): (id: string, args: unknown[]) => Promise<unknown> {
  if (!_callServer) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _callServer = require('./server-actions').callServer;
    } catch {
      // Fallback no-op if server-actions module isn't bundled
      _callServer = async () => {
        throw new Error(
          'Server Actions are not configured. Ensure react-server-dom-webpack is installed.'
        );
      };
    }
  }
  return _callServer!;
}

function fetchFlight(pathname: string, search: string): Thenable<React.ReactNode> {
  const key = cacheKey(pathname, search);
  const cached = flightCache.get(key);
  if (cached) return cached;

  const create = getCreateFromFetch();
  const thenable = create(
    fetch(`/rsc${pathname}${search}`, {
      headers: { Accept: 'text/x-component' },
    }),
    { callServer: getCallServer() }
  );

  // Evict oldest if over limit
  if (flightCache.size >= CACHE_MAX) {
    const firstKey = flightCache.keys().next().value;
    if (firstKey !== undefined) flightCache.delete(firstKey);
  }
  flightCache.set(key, thenable);
  return thenable;
}

/** Evict a specific cache entry (used on refresh) */
function evictFlight(pathname: string, search: string): void {
  flightCache.delete(cacheKey(pathname, search));
}

/** Prefetch without blocking — fire-and-forget */
function prefetchFlight(pathname: string, search: string): void {
  const key = cacheKey(pathname, search);
  if (flightCache.has(key)) return;
  // Create the thenable which kicks off the fetch
  fetchFlight(pathname, search);
}

// ---------------------------------------------------------------------------
// RSCRoot — reads the current Flight thenable
// ---------------------------------------------------------------------------

function RSCRoot({ response }: { response: Thenable<React.ReactNode> }) {
  return React.use(response as Promise<React.ReactNode>) as React.ReactElement;
}

// ---------------------------------------------------------------------------
// RSCRouter component
// ---------------------------------------------------------------------------

export interface RSCRouterProps {
  /** Initial Flight response created during hydration */
  initialResponse: Thenable<React.ReactNode>;
  /** Initial pathname (defaults to window.location.pathname) */
  initialPathname?: string;
  children?: React.ReactNode;
}

export function RSCRouter({ initialResponse, initialPathname }: RSCRouterProps) {
  const [flightResponse, setFlightResponse] =
    React.useState<Thenable<React.ReactNode>>(initialResponse);

  const [pathname, setPathname] = React.useState<string>(
    initialPathname || (typeof window !== 'undefined' ? window.location.pathname : '/')
  );

  const [searchParams, setSearchParams] = React.useState<URLSearchParams>(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams()
  );

  const [isPending, startTransition] = React.useTransition();

  // Handle browser back/forward
  React.useEffect(() => {
    const onPopState = () => {
      const newPath = window.location.pathname;
      const newSearch = window.location.search;

      startTransition(() => {
        setPathname(newPath);
        setSearchParams(new URLSearchParams(newSearch));
        setFlightResponse(fetchFlight(newPath, newSearch));
      });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Navigation methods
  const navigate = React.useCallback(
    (url: string, mode: 'push' | 'replace', options?: NavigationOptions) => {
      const parsed = new URL(url, window.location.origin);
      const newPath = parsed.pathname;
      const newSearch = parsed.search;

      if (mode === 'push') {
        window.history.pushState({}, '', url);
      } else {
        window.history.replaceState({}, '', url);
      }

      startTransition(() => {
        setPathname(newPath);
        setSearchParams(new URLSearchParams(newSearch));
        setFlightResponse(fetchFlight(newPath, newSearch));
      });

      if (options?.scroll !== false) {
        window.scrollTo(0, 0);
      }
    },
    []
  );

  const push = React.useCallback(
    (url: string, options?: NavigationOptions) => navigate(url, 'push', options),
    [navigate]
  );

  const replace = React.useCallback(
    (url: string, options?: NavigationOptions) => navigate(url, 'replace', options),
    [navigate]
  );

  const back = React.useCallback(() => window.history.back(), []);
  const forward = React.useCallback(() => window.history.forward(), []);

  const prefetch = React.useCallback((url: string) => {
    const parsed = new URL(url, window.location.origin);
    prefetchFlight(parsed.pathname, parsed.search);
  }, []);

  const refresh = React.useCallback(() => {
    const curPath = window.location.pathname;
    const curSearch = window.location.search;
    evictFlight(curPath, curSearch);
    startTransition(() => {
      setFlightResponse(fetchFlight(curPath, curSearch));
    });
  }, []);

  const contextValue = React.useMemo<RSCNavigationState>(
    () => ({
      pathname,
      searchParams,
      push,
      replace,
      back,
      forward,
      prefetch,
      refresh,
      isPending,
    }),
    [pathname, searchParams, push, replace, back, forward, prefetch, refresh, isPending]
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const bridge = {
      refresh,
      prefetch,
      resume: (url: string) => {
        const parsed = new URL(url, window.location.origin);
        const nextPath = parsed.pathname;
        const nextSearch = parsed.search;
        const nextUrl = `${nextPath}${nextSearch}`;
        const nextResponse = fetchFlight(nextPath, nextSearch);

        document.documentElement.setAttribute('data-vista-ppr', 'flight-resuming');
        recordRuntimeTrace('rsc-resume-start', { url: nextUrl });
        dispatchRuntimeEvent('vista:rsc-resume-start', { url: nextUrl });
        startTransition(() => {
          setPathname(nextPath);
          setSearchParams(new URLSearchParams(nextSearch));
          setFlightResponse(nextResponse);
        });

        Promise.resolve(nextResponse)
          .then(() => {
            recordRuntimeTrace('rsc-resume-complete', { url: nextUrl });
            dispatchRuntimeEvent('vista:rsc-resume-complete', { url: nextUrl });
          })
          .catch((error) => {
            const message =
              error && typeof error === 'object' && 'message' in error
                ? String((error as any).message || error)
                : String(error || 'Unknown RSC resume error');
            recordRuntimeTrace('rsc-resume-error', { url: nextUrl, message });
            dispatchRuntimeEvent('vista:rsc-resume-error', { url: nextUrl, message });
          });
      },
      getState: () => ({
        pathname,
        search: searchParams.toString() ? `?${searchParams.toString()}` : '',
        isPending,
      }),
    };

    window.__VISTA_RSC_ROUTER__ = bridge;
    recordRuntimeTrace('rsc-router-ready', {
      pathname,
      search: searchParams.toString() ? `?${searchParams.toString()}` : '',
    });
    document.dispatchEvent(new CustomEvent('vista:rsc-router-ready'));

    return () => {
      if (window.__VISTA_RSC_ROUTER__ === bridge) {
        delete window.__VISTA_RSC_ROUTER__;
      }
    };
  }, [pathname, searchParams, isPending, refresh, prefetch]);

  return (
    <RSCRouterContext.Provider value={contextValue}>
      <RSCRoot response={flightResponse} />
    </RSCRouterContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks — unified versions that work in both RSC and legacy modes
// ---------------------------------------------------------------------------

/**
 * Returns the RSC router instance if inside an RSCRouter,
 * otherwise falls back to null.
 */
export function useRSCRouter(): RSCNavigationState | null {
  return React.useContext(RSCRouterContext);
}
