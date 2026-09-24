'use client';

import * as React from 'react';

// --- Context ---

export const RouterContext = React.createContext<{
  push: (url: string, options?: RouterOptions) => void;
  replace: (url: string, options?: RouterOptions) => void;
  back: () => void;
  forward: () => void;
  prefetch: (url: string) => void;
  refresh: () => void;
  params: Record<string, string>;
  pathname: string;
} | null>(null);

export interface RouterOptions {
  scroll?: boolean;
}

export interface AppRouterInstance {
  push(url: string, options?: RouterOptions): void;
  replace(url: string, options?: RouterOptions): void;
  back(): void;
  forward(): void;
  prefetch(url: string): void;
  refresh(): void;
}

// --- Router Component ---

interface RouteNode {
  segment: string;
  kind: 'static' | 'dynamic' | 'catch-all' | 'optional-catch-all' | 'group';
  index?: React.ComponentType<any>;
  layout?: React.ComponentType<any>;
  loading?: React.ComponentType<any>;
  error?: React.ComponentType<any>;
  notFound?: React.ComponentType<any>;
  children?: RouteNode[];
}

interface RouterProps {
  routeTree: RouteNode;
  initialPath?: string;
}

export function Router({ routeTree, initialPath }: RouterProps) {
  const [currentPath, setCurrentPath] = React.useState<string>(
    initialPath || (typeof window !== 'undefined' ? window.location.pathname : '/')
  );

  React.useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Match Route
  const match = React.useMemo(() => matchRoute(routeTree, currentPath), [routeTree, currentPath]);

  const routerValue = React.useMemo(
    () => ({
      push: (url: string, options?: RouterOptions) => {
        window.history.pushState({}, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
        if (options?.scroll !== false) window.scrollTo(0, 0);
      },
      replace: (url: string, options?: RouterOptions) => {
        window.history.replaceState({}, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
        if (options?.scroll !== false) window.scrollTo(0, 0);
      },
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      prefetch: (url: string) => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        document.head.appendChild(link);
      },
      refresh: () => window.dispatchEvent(new PopStateEvent('popstate')),
      params: match.params,
      pathname: currentPath,
    }),
    [currentPath, match.params]
  );

  // Render Component Tree
  // Stack: [RootLayout, Layout2, Layout3, Page]
  let content = match.PageComponent ? <match.PageComponent {...match.params} /> : null;

  if (!content && match.NotFoundComponent) {
    content = <match.NotFoundComponent />;
  }

  // Wrap in layouts from innermost to outermost.
  // Using stable keys based on segment path ensures React preserves shared
  // layout instances across navigations (e.g. /dashboard/settings → /dashboard/profile
  // keeps the dashboard layout mounted instead of remounting it).
  for (let i = match.layouts.length - 1; i >= 0; i--) {
    const Layout = match.layouts[i];
    const layoutKey = match.layoutKeys[i] || `layout-${i}`;
    if (Layout) {
      content = (
        <Layout key={layoutKey} params={match.params}>
          {content}
        </Layout>
      );
    }
  }

  return <RouterContext.Provider value={routerValue}>{content}</RouterContext.Provider>;
}

// --- Matching Logic ---

interface MatchResult {
  PageComponent: React.ComponentType<any> | null;
  NotFoundComponent: React.ComponentType<any> | null;
  layouts: React.ComponentType<any>[];
  /** Segment path for each layout — used as stable React keys for layout persistence */
  layoutKeys: string[];
  params: Record<string, string>;
}

function matchRoute(root: RouteNode, path: string): MatchResult {
  const segments = path.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  const layouts: React.ComponentType<any>[] = [];
  const layoutKeys: string[] = [];

  // Track the cumulative segment path for stable layout keys
  let currentKeyPath = '/';

  // Nearest NotFound found during traversal (propagates down)
  let nearestNotFound = root.notFound || null;

  // Helper to traverse
  function traverse(node: RouteNode, segmentIndex: number): MatchResult | null {
    // Collect Layout with a stable key
    if (node.layout) {
      layouts.push(node.layout);
      layoutKeys.push(currentKeyPath);
    }
    if (node.notFound) nearestNotFound = node.notFound;

    // If we processed all segments, check for index page
    if (segmentIndex === segments.length) {
      if (node.index) {
        return {
          PageComponent: node.index,
          NotFoundComponent: nearestNotFound,
          layouts,
          layoutKeys,
          params,
        };
      }

      // Check for optional catch-all children that match zero segments
      if (node.children) {
        for (const child of node.children) {
          if (child.kind === 'optional-catch-all' && child.index) {
            params[child.segment] = '';
            if (child.layout) {
              layouts.push(child.layout);
              layoutKeys.push(currentKeyPath + '[...' + child.segment + ']');
            }
            return {
              PageComponent: child.index,
              NotFoundComponent: nearestNotFound,
              layouts,
              layoutKeys,
              params,
            };
          }
        }
      }

      // No index page here -> 404
      return null;
    }

    const currentSegment = segments[segmentIndex];

    // Find matching child
    if (node.children) {
      // Traverse groups transparently (they don't consume a URL segment)
      for (const child of node.children) {
        if (child.kind === 'group') {
          const savedKeyPath = currentKeyPath;
          currentKeyPath = currentKeyPath + '(' + child.segment + ')/';
          const result = traverse(child, segmentIndex);
          if (result) return result;
          currentKeyPath = savedKeyPath;
        }
      }

      for (const child of node.children) {
        let isMatch = false;

        if (child.kind === 'static' && child.segment === currentSegment) {
          isMatch = true;
        } else if (child.kind === 'dynamic') {
          isMatch = true;
          params[child.segment] = currentSegment;
        } else if (child.kind === 'catch-all') {
          isMatch = true;
          const catchAll = segments.slice(segmentIndex).join('/');
          params[child.segment] = catchAll;
          if (child.index) {
            if (child.layout) {
              layouts.push(child.layout);
              layoutKeys.push(currentKeyPath + '[...' + child.segment + ']');
            }
            return {
              PageComponent: child.index,
              NotFoundComponent: nearestNotFound,
              layouts,
              layoutKeys,
              params,
            };
          }
        } else if (child.kind === 'optional-catch-all') {
          isMatch = true;
          const catchAll = segments.slice(segmentIndex).join('/');
          params[child.segment] = catchAll;
          if (child.index) {
            if (child.layout) {
              layouts.push(child.layout);
              layoutKeys.push(currentKeyPath + '[[...' + child.segment + ']]');
            }
            return {
              PageComponent: child.index,
              NotFoundComponent: nearestNotFound,
              layouts,
              layoutKeys,
              params,
            };
          }
        }

        if (isMatch && child.kind !== 'group') {
          const savedKeyPath = currentKeyPath;
          currentKeyPath = currentKeyPath + child.segment + '/';
          const result = traverse(child, segmentIndex + 1);
          if (result) return result;
          currentKeyPath = savedKeyPath;
        }
      }
    }

    return null;
  }

  const result = traverse(root, 0);

  if (result) return result;

  // 404
  return {
    PageComponent: null,
    NotFoundComponent: nearestNotFound,
    layouts,
    layoutKeys,
    params,
  };
}

// --- Hooks ---

export function useRouter(): AppRouterInstance {
  const context = React.useContext(RouterContext);
  if (!context) throw new Error('useRouter must be used within a RouterProvider/Router');
  return context;
}

export function useParams(): Record<string, string> {
  const context = React.useContext(RouterContext);
  if (!context) return {};
  return context.params;
}

export function usePathname(): string {
  const context = React.useContext(RouterContext);
  if (!context) {
    if (typeof window !== 'undefined' && window.location) {
      return window.location.pathname;
    }
    return '';
  }
  return context.pathname;
}
