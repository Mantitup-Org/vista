/**
 * Vista Navigation Hooks
 *
 * Provides hooks for reading route information.
 * Similar to Next.js navigation hooks.
 *
 * When inside an RSCRouter these hooks read from the shared RSC
 * navigation context. Otherwise they fall back to popstate listeners
 * (legacy mode).
 */
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
exports.useRouter = void 0;
exports.usePathname = usePathname;
exports.useSearchParams = useSearchParams;
exports.useParams = useParams;
exports.useSelectedLayoutSegment = useSelectedLayoutSegment;
exports.useSelectedLayoutSegments = useSelectedLayoutSegments;
const React = __importStar(require("react"));
const context_1 = require("../router/context");
const rsc_router_1 = require("./rsc-router");
/**
 * Returns the current pathname.
 * Uses the RSC router context when available, otherwise listens
 * to popstate events.
 */
function usePathname() {
    const rscCtx = (0, rsc_router_1.useRSCRouter)();
    if (rscCtx)
        return rscCtx.pathname;
    const [pathname, setPathname] = React.useState(() => typeof window !== 'undefined' ? window.location.pathname : '/');
    React.useEffect(() => {
        const handlePopState = () => {
            setPathname(window.location.pathname);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
    return pathname;
}
/**
 * Returns the current search params.
 * Uses the RSC router context when available.
 */
function useSearchParams() {
    const rscCtx = (0, rsc_router_1.useRSCRouter)();
    if (rscCtx)
        return rscCtx.searchParams;
    const [searchParams, setSearchParams] = React.useState(() => typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams());
    React.useEffect(() => {
        const handlePopState = () => {
            setSearchParams(new URLSearchParams(window.location.search));
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
    return searchParams;
}
/**
 * Returns dynamic route parameters.
 * For route /users/[id]/posts/[postId], returns { id: '123', postId: '456' }
 */
function useParams() {
    const context = (0, context_1.useRouterContext)();
    const pathname = usePathname();
    // Basic param extraction (simplified)
    // In a full implementation, this would match against route patterns
    const params = {};
    // Extract dynamic segments from URL
    const pathParts = pathname.split('/').filter(Boolean);
    pathParts.forEach((part, index) => {
        if (part.match(/^\d+$/)) {
            params[`param${index}`] = part;
        }
    });
    return params;
}
/**
 * Returns the currently active segment of the layout
 */
function useSelectedLayoutSegment() {
    const pathname = usePathname();
    const segments = pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
}
/**
 * Returns all active segments of the layout
 */
function useSelectedLayoutSegments() {
    const pathname = usePathname();
    return pathname.split('/').filter(Boolean);
}
var router_1 = require("./router");
Object.defineProperty(exports, "useRouter", { enumerable: true, get: function () { return router_1.useRouter; } });
