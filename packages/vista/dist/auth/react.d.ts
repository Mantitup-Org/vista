import { type ReactNode } from 'react';
import type { AuthSession } from './core';
interface SessionContextValue {
    data: AuthSession | null;
    status: 'loading' | 'authenticated' | 'unauthenticated';
    update: () => Promise<void>;
}
export declare function SessionProvider({ children, basePath, }: {
    children: ReactNode;
    basePath?: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function useSession(): SessionContextValue;
export declare function signIn(provider?: string, options?: Record<string, string>, basePath?: string): Promise<void>;
export declare function signOut(basePath?: string): void;
/** Back-compat aliases for the old demo AuthProvider. */
export declare const AuthProvider: typeof SessionProvider;
export declare const useAuth: typeof useSession;
export {};
