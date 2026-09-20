'use client';
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.useIsActive = exports.useLinkStatus = exports.Link = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const router_1 = require("./router");
const rsc_router_1 = require("./rsc-router");
// Normalize href (string or object) to string
const formatUrl = (url) => {
    if (typeof url === 'string')
        return url;
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
const prefetchedUrls = new Set();
// Prefetch a URL by creating a hidden link element
const prefetchUrl = (url) => {
    if (prefetchedUrls.has(url))
        return;
    if (typeof window === 'undefined')
        return;
    // Don't prefetch external URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
        if (!url.startsWith(window.location.origin))
            return;
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
function isInternalUrl(url) {
    if (!url)
        return false;
    // Hash-only links
    if (url.startsWith('#'))
        return false;
    // Protocol-relative or absolute external
    if (url.startsWith('//'))
        return false;
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
function resolvePrefetchBehavior(prefetch) {
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
exports.Link = react_1.default.forwardRef(({ href, as, replace, scroll = true, shallow, passHref, prefetch = 'auto', legacyBehavior, children, onClick, onMouseEnter, onTouchStart, onNavigate, target, ...props }, ref) => {
    // Try the RSC router first — if we're inside an RSCRouter, use
    // Flight-based navigation. Otherwise fall back to the legacy router.
    const rscRouter = (0, rsc_router_1.useRSCRouter)();
    const legacyRouter = (0, react_1.useContext)(router_1.RouterContext);
    const fallbackPathname = (0, router_1.usePathname)();
    const pathname = rscRouter?.pathname ?? legacyRouter?.pathname ?? fallbackPathname;
    const linkRef = (0, react_1.useRef)(null);
    const targetPath = formatUrl(as || href);
    const [isActive, setIsActive] = (0, react_1.useState)(false);
    const internal = (0, react_1.useMemo)(() => isInternalUrl(targetPath), [targetPath]);
    const prefetchBehavior = (0, react_1.useMemo)(() => resolvePrefetchBehavior(prefetch), [prefetch]);
    // Combine refs
    const setRefs = (0, react_1.useCallback)((node) => {
        linkRef.current = node;
        if (typeof ref === 'function') {
            ref(node);
        }
        else if (ref) {
            ref.current = node;
        }
    }, [ref]);
    // Check if link is active (current route)
    (0, react_1.useEffect)(() => {
        if (typeof window !== 'undefined') {
            // Exact match or starts-with for nested routes
            const exact = pathname === targetPath;
            const partial = targetPath !== '/' && pathname.startsWith(targetPath + '/');
            setIsActive(exact || partial);
        }
    }, [targetPath, pathname]);
    // Prefetch on viewport intersection (skip for external links & auto mode)
    (0, react_1.useEffect)(() => {
        if (!prefetchBehavior.viewport)
            return;
        if (!internal)
            return;
        if (typeof window === 'undefined')
            return;
        if (pathname === targetPath)
            return;
        const element = linkRef.current;
        if (!element)
            return;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    if (rscRouter) {
                        rscRouter.prefetch(targetPath);
                    }
                    else {
                        prefetchUrl(targetPath);
                    }
                    observer.disconnect();
                }
            });
        }, {
            rootMargin: '200px',
            threshold: 0,
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [prefetchBehavior.viewport, targetPath, pathname, rscRouter, internal]);
    // Prefetch on hover
    const handleMouseEnter = (0, react_1.useCallback)((e) => {
        if (onMouseEnter)
            onMouseEnter(e);
        if (prefetchBehavior.intent && internal && pathname !== targetPath) {
            if (rscRouter) {
                rscRouter.prefetch(targetPath);
            }
            else {
                prefetchUrl(targetPath);
            }
        }
    }, [onMouseEnter, prefetchBehavior.intent, targetPath, pathname, rscRouter, internal]);
    // Prefetch on touch (mobile devices)
    const handleTouchStart = (0, react_1.useCallback)((e) => {
        if (onTouchStart)
            onTouchStart(e);
        if (prefetchBehavior.intent && internal && pathname !== targetPath) {
            if (rscRouter) {
                rscRouter.prefetch(targetPath);
            }
            else {
                prefetchUrl(targetPath);
            }
        }
    }, [onTouchStart, prefetchBehavior.intent, targetPath, pathname, rscRouter, internal]);
    // Handle navigation
    const handleClick = (0, react_1.useCallback)((e) => {
        if (onClick)
            onClick(e);
        // Standard link behavior checks
        if (e.defaultPrevented)
            return;
        if (e.button !== 0)
            return; // only left-click
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
            return; // modifier = new tab
        if (target === '_blank')
            return; // explicit new tab
        if (!href)
            return;
        if (!internal)
            return; // external / mailto / tel
        if (!rscRouter && !legacyRouter)
            return; // No router provider -> allow native navigation
        e.preventDefault();
        if (onNavigate)
            onNavigate();
        // Use RSC router if available, otherwise legacy
        if (rscRouter) {
            if (replace) {
                rscRouter.replace(targetPath, { scroll });
            }
            else {
                rscRouter.push(targetPath, { scroll });
            }
        }
        else if (legacyRouter) {
            if (replace) {
                legacyRouter.replace(targetPath, { scroll });
            }
            else {
                legacyRouter.push(targetPath, { scroll });
            }
        }
    }, [
        onClick,
        href,
        targetPath,
        replace,
        scroll,
        rscRouter,
        legacyRouter,
        onNavigate,
        target,
        internal,
    ]);
    // Data + Aria attributes for styling active links
    const dataProps = {
        'data-active': isActive ? 'true' : undefined,
        'aria-current': isActive ? 'page' : undefined,
    };
    return ((0, jsx_runtime_1.jsx)("a", { href: targetPath, onClick: handleClick, onMouseEnter: handleMouseEnter, onTouchStart: handleTouchStart, ref: setRefs, target: target, ...dataProps, ...props, children: children }));
});
exports.Link.displayName = 'Link';
/**
 * Hook to check link navigation status.
 * Returns `{ pending: true }` while a Flight navigation is in progress.
 */
const useLinkStatus = () => {
    const rscRouter = (0, rsc_router_1.useRSCRouter)();
    if (rscRouter) {
        return { pending: rscRouter.isPending };
    }
    return { pending: false };
};
exports.useLinkStatus = useLinkStatus;
/**
 * Hook to check if a path is active
 */
const useIsActive = (path) => {
    const pathname = (0, router_1.usePathname)();
    return pathname === path;
};
exports.useIsActive = useIsActive;
exports.default = exports.Link;
