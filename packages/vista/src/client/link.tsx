'use client';

import React, {
  AnchorHTMLAttributes,
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
  useContext,
} from 'react';
import { RouterContext, usePathname } from './router';
import { useRSCRouter } from './rsc-router';

/*
 * Vista Link Component
 * Next.js 15-compatible Link with:
 *  - IntersectionObserver viewport prefetch
 *  - Hover + touchstart prefetch
 *  - Flight-based RSC navigation (zero full-page reloads)
 *  - Active link detection with aria-current + data-active
 *  - External / hash / mailto / tel link passthrough
 *  - Cmd/Ctrl+click native new-tab behaviour
 */

type Url = string | { href: string; query?: Record<string, string>; hash?: string };

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Destination URL (string or URL object) */
  href: Url;
  /** Resolved URL override (like Next.js `as`) */
  as?: Url;
  /** Use history.replaceState instead of pushState */
  replace?: boolean;
  /** Scroll to top after navigation (default: true) */
  scroll?: boolean;
  /** Client-side only transition (no SSR refetch) */
  shallow?: boolean;
  /** Force href on child element */
  passHref?: boolean;
  /** Prefetch strategy: true = always, 'auto' = production-only (Next-like), false/null = off */
  prefetch?: boolean | 'auto' | null;
  /** Locale for internationalised routing */
  locale?: string | false;
  /** Render as legacy <a> with child element */
  legacyBehavior?: boolean;
  /** Callback fired when navigation starts */
  onNavigate?: () => void;
}

// Normalize href (string or object) to string
const formatUrl = (url: Url): string => {
  if (typeof url === 'string') return url;
  if (typeof url === 'object' && url !== null) {
    let result = url.href || '';
    if (url.query) {
      const params = new URLSearchParams(url.query).toString();
      result += (result.includes('?') ? '&' : '?') + params;
    }
    if (url.hash) {
      result += url.hash.startsWith('#') ? url.hash : `#${url.hash}`;
    }
    return result;
  }
  return '';
};

// Set of URLs that have been prefetched
const prefetchedUrls = new Set<string>();

// Prefetch a URL by creating a hidden link element
const prefetchUrl = (url: string) => {
  if (prefetchedUrls.has(url)) return;
  if (typeof window === 'undefined') return;

  // Don't prefetch external URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (!url.startsWith(window.location.origin)) return;
  }

  prefetchedUrls.add(url);

  // Create prefetch link
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  link.as = 'document';
  document.head.appendChild(link);
};

/**
 * Check whether a URL should be handled by the client-side router.
 * Returns `false` for external, mailto:, tel:, hash-only, and download links.
 */
function isInternalUrl(url: string): boolean {
  if (!url) return false;
  // Hash-only links
  if (url.startsWith('#')) return false;
  // Protocol-relative or absolute external
  if (url.startsWith('//')) return false;
  // Non-http protocols
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (typeof window !== 'undefined' && !url.startsWith(window.location.origin)) {
        return false;
      }
      return true;
    }
    return false; // mailto:, tel:, ftp:, etc.
  }
  return true;
}

function resolvePrefetchBehavior(prefetch: LinkProps['prefetch']): {
  viewport: boolean;
  intent: boolean;
} {
  if (prefetch === false || prefetch === null) {
    return { viewport: false, intent: false };
  }

  if (prefetch === true) {
    return { viewport: true, intent: true };
  }

  const isProduction = process.env.NODE_ENV === 'production';
  return {
    viewport: isProduction,
    intent: isProduction,
  };
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  (
    {
      href,
      as,
      replace,
      scroll = true,
      shallow,
      passHref,
      prefetch = 'auto',
      legacyBehavior,
      children,
      onClick,
      onMouseEnter,
      onTouchStart,
      onNavigate,
      target,
      ...props
    },
    ref
  ) => {
    // Try the RSC router first — if we're inside an RSCRouter, use
    // Flight-based navigation. Otherwise fall back to the legacy router.
    const rscRouter = useRSCRouter();
    const legacyRouter = useContext(RouterContext);
    const fallbackPathname = usePathname();
    const pathname = rscRouter?.pathname ?? legacyRouter?.pathname ?? fallbackPathname;
    const linkRef = useRef<HTMLAnchorElement | null>(null);
    const targetPath = formatUrl(as || href);
    const [isActive, setIsActive] = useState(false);
    const internal = useMemo(() => isInternalUrl(targetPath), [targetPath]);
    const prefetchBehavior = useMemo(() => resolvePrefetchBehavior(prefetch), [prefetch]);

    // Combine refs
    const setRefs = useCallback(
      (node: HTMLAnchorElement | null) => {
        linkRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLAnchorElement | null>).current = node;
        }
      },
      [ref]
    );

    // Check if link is active (current route)
    useEffect(() => {
      if (typeof window !== 'undefined') {
        const targetPathname = targetPath.split(/[?#]/)[0] || '/';
        // Exact match or starts-with for nested routes
        const exact = pathname === targetPathname;
        const partial = targetPathname !== '/' && pathname.startsWith(targetPathname + '/');
        setIsActive(exact || partial);
      }
    }, [targetPath, pathname]);

    // Prefetch on viewport intersection (skip for external links & auto mode)
    useEffect(() => {
      if (!prefetchBehavior.viewport) return;
      if (!internal) return;
      if (typeof window === 'undefined') return;
      if (pathname === targetPath) return;

      const element = linkRef.current;
      if (!element) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              if (rscRouter) {
                rscRouter.prefetch(targetPath);
              } else {
                prefetchUrl(targetPath);
              }
              observer.disconnect();
            }
          });
        },
        {
          rootMargin: '200px',
          threshold: 0,
        }
      );

      observer.observe(element);

      return () => observer.disconnect();
    }, [prefetchBehavior.viewport, targetPath, pathname, rscRouter, internal]);

    // Prefetch on hover
    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (onMouseEnter) onMouseEnter(e);
        if (prefetchBehavior.intent && internal && pathname !== targetPath) {
          if (rscRouter) {
            rscRouter.prefetch(targetPath);
          } else {
            prefetchUrl(targetPath);
          }
        }
      },
      [onMouseEnter, prefetchBehavior.intent, targetPath, pathname, rscRouter, internal]
    );

    // Prefetch on touch (mobile devices)
    const handleTouchStart = useCallback(
      (e: React.TouchEvent<HTMLAnchorElement>) => {
        if (onTouchStart) onTouchStart(e);
        if (prefetchBehavior.intent && internal && pathname !== targetPath) {
          if (rscRouter) {
            rscRouter.prefetch(targetPath);
          } else {
            prefetchUrl(targetPath);
          }
        }
      },
      [onTouchStart, prefetchBehavior.intent, targetPath, pathname, rscRouter, internal]
    );

    // Handle navigation
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (onClick) onClick(e);

        // Standard link behavior checks
        if (e.defaultPrevented) return;
        if (e.button !== 0) return; // only left-click
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // modifier = new tab
        if (target && target !== '_self') return; // explicit new tab or frame target
        if (props.download !== undefined && props.download !== false) return; // native file download
        if (!href) return;
        if (!internal) return; // external / mailto / tel

        const targetPathname = targetPath.split(/[?#]/)[0] || '/';
        if (targetPath.includes('#') && targetPathname === pathname) {
          // Same-page hash link: allow native document scroll
          return;
        }

        if (!rscRouter && !legacyRouter) return; // No router provider -> allow native navigation

        e.preventDefault();

        if (onNavigate) onNavigate();

        // Use RSC router if available, otherwise legacy
        if (rscRouter) {
          if (replace) {
            rscRouter.replace(targetPath, { scroll });
          } else {
            rscRouter.push(targetPath, { scroll });
          }
        } else if (legacyRouter) {
          if (replace) {
            legacyRouter.replace(targetPath, { scroll });
          } else {
            legacyRouter.push(targetPath, { scroll });
          }
        }
      },
      [
        onClick,
        href,
        targetPath,
        pathname,
        replace,
        scroll,
        rscRouter,
        legacyRouter,
        onNavigate,
        target,
        props.download,
        internal,
      ]
    );

    // Data + Aria attributes for styling active links
    const dataProps: Record<string, string | undefined> = {
      'data-active': isActive ? 'true' : undefined,
      'aria-current': isActive ? 'page' : undefined,
    };

    return (
      <a
        href={targetPath}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onTouchStart={handleTouchStart}
        ref={setRefs}
        target={target}
        {...dataProps}
        {...props}
      >
        {children}
      </a>
    );
  }
);

Link.displayName = 'Link';

/**
 * Hook to check link navigation status.
 * Returns `{ pending: true }` while a Flight navigation is in progress.
 */
export const useLinkStatus = () => {
  const rscRouter = useRSCRouter();
  if (rscRouter) {
    return { pending: rscRouter.isPending };
  }
  return { pending: false };
};

/**
 * Hook to check if a path is active
 */
export const useIsActive = (path: string): boolean => {
  const routerPathname = usePathname();
  const currentPathname =
    routerPathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  const targetPathname = path.split(/[?#]/)[0] || '/';
  return currentPathname === targetPathname;
};

export default Link;
