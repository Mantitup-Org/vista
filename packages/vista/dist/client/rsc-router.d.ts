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
export declare const RSCRouterContext: React.Context<RSCNavigationState>;
export interface RSCRouterProps {
    /** Initial Flight response created during hydration */
    initialResponse: Thenable<React.ReactNode>;
    /** Initial pathname (defaults to window.location.pathname) */
    initialPathname?: string;
    children?: React.ReactNode;
}
export declare function RSCRouter({ initialResponse, initialPathname }: RSCRouterProps): import("react/jsx-runtime").JSX.Element;
/**
 * Returns the RSC router instance if inside an RSCRouter,
 * otherwise falls back to null.
 */
export declare function useRSCRouter(): RSCNavigationState | null;
export {};
