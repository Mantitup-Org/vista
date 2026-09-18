import { type AuthConfig, type AuthSession, type ResolvedAuthConfig } from './core';
export * from './core';
export declare function VistaAuth(config: AuthConfig): {
    handlers: {
        GET: (request: Request) => Promise<Response>;
        POST: (request: Request) => Promise<Response>;
    };
    auth: (request?: Request) => Promise<AuthSession | null>;
    signIn: (providerId?: string, options?: Record<string, string>) => Promise<Response>;
    signOut: () => Promise<Response>;
    authMiddleware: (authorized?: (params: {
        auth: AuthSession | null;
        request: Request;
    }) => boolean | Response | Promise<boolean | Response>) => ({ request, next }: {
        request: any;
        next: () => Promise<Response>;
    }) => Promise<Response>;
    config: ResolvedAuthConfig;
};
export default VistaAuth;
