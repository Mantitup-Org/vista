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
exports.RouterContext = void 0;
exports.Router = Router;
exports.useRouter = useRouter;
exports.useParams = useParams;
exports.usePathname = usePathname;
const jsx_runtime_1 = require("react/jsx-runtime");
const React = __importStar(require("react"));
// --- Context ---
exports.RouterContext = React.createContext(null);
function Router({ routeTree, initialPath }) {
    const [currentPath, setCurrentPath] = React.useState(initialPath || (typeof window !== 'undefined' ? window.location.pathname : '/'));
    React.useEffect(() => {
        const onPopState = () => setCurrentPath(window.location.pathname);
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);
    // Match Route
    const match = React.useMemo(() => matchRoute(routeTree, currentPath), [routeTree, currentPath]);
    const routerValue = React.useMemo(() => ({
        push: (url, options) => {
            window.history.pushState({}, '', url);
            window.dispatchEvent(new PopStateEvent('popstate'));
            if (options?.scroll !== false)
                window.scrollTo(0, 0);
        },
        replace: (url, options) => {
            window.history.replaceState({}, '', url);
            window.dispatchEvent(new PopStateEvent('popstate'));
            if (options?.scroll !== false)
                window.scrollTo(0, 0);
        },
        back: () => window.history.back(),
        forward: () => window.history.forward(),
        prefetch: (url) => {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = url;
            document.head.appendChild(link);
        },
        refresh: () => window.dispatchEvent(new PopStateEvent('popstate')),
        params: match.params,
        pathname: currentPath,
    }), [currentPath, match.params]);
    // Render Component Tree
    // Stack: [RootLayout, Layout2, Layout3, Page]
    let content = match.PageComponent ? (0, jsx_runtime_1.jsx)(match.PageComponent, { ...match.params }) : null;
    if (!content && match.NotFoundComponent) {
        content = (0, jsx_runtime_1.jsx)(match.NotFoundComponent, {});
    }
    // Wrap in layouts from innermost to outermost.
    // Using stable keys based on segment path ensures React preserves shared
    // layout instances across navigations (e.g. /dashboard/settings → /dashboard/profile
    // keeps the dashboard layout mounted instead of remounting it).
    for (let i = match.layouts.length - 1; i >= 0; i--) {
        const Layout = match.layouts[i];
        const layoutKey = match.layoutKeys[i] || `layout-${i}`;
        if (Layout) {
            content = ((0, jsx_runtime_1.jsx)(Layout, { params: match.params, children: content }, layoutKey));
        }
    }
    return (0, jsx_runtime_1.jsx)(exports.RouterContext.Provider, { value: routerValue, children: content });
}
function matchRoute(root, path) {
    const segments = path.split('/').filter(Boolean);
    const params = {};
    const layouts = [];
    const layoutKeys = [];
    // Track the cumulative segment path for stable layout keys
    let currentKeyPath = '/';
    // Nearest NotFound found during traversal (propagates down)
    let nearestNotFound = root.notFound || null;
    // Helper to traverse
    function traverse(node, segmentIndex) {
        // Collect Layout with a stable key
        if (node.layout) {
            layouts.push(node.layout);
            layoutKeys.push(currentKeyPath);
        }
        if (node.notFound)
            nearestNotFound = node.notFound;
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
                    if (result)
                        return result;
                    currentKeyPath = savedKeyPath;
                }
            }
            for (const child of node.children) {
                let isMatch = false;
                if (child.kind === 'static' && child.segment === currentSegment) {
                    isMatch = true;
                }
                else if (child.kind === 'dynamic') {
                    isMatch = true;
                    params[child.segment] = currentSegment;
                }
                else if (child.kind === 'catch-all') {
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
                }
                else if (child.kind === 'optional-catch-all') {
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
                    if (result)
                        return result;
                    currentKeyPath = savedKeyPath;
                }
            }
        }
        return null;
    }
    const result = traverse(root, 0);
    if (result)
        return result;
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
function useRouter() {
    const context = React.useContext(exports.RouterContext);
    if (!context)
        throw new Error('useRouter must be used within a RouterProvider/Router');
    return context;
}
function useParams() {
    const context = React.useContext(exports.RouterContext);
    if (!context)
        return {};
    return context.params;
}
function usePathname() {
    const context = React.useContext(exports.RouterContext);
    if (!context) {
        if (typeof window !== 'undefined' && window.location) {
            return window.location.pathname;
        }
        return '';
    }
    return context.pathname;
}
