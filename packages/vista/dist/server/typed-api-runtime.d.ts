import type express from 'express';
import type { ResolvedTypedApiConfig } from '../config';
import type { RouteParams } from './route-patterns';
export interface RouteHandlerMatch {
    /** Absolute path of the resolved `route.*` file. */
    filePath: string;
    /** Dynamic segment values, empty for a fully static route. */
    params: RouteParams;
}
export declare function resolveLegacyApiRoutePath(cwd: string, requestPath: string): string | null;
/**
 * Resolve a request path to a route handler file plus its dynamic params.
 *
 * Static routes are answered by a direct filesystem probe, which keeps the common
 * case free of any directory walk. Only when that misses do we consult the discovered
 * route table, which is what makes `app/api/users/[id]/route.ts` reachable.
 */
export declare function resolveRouteHandlerMatch(cwd: string, requestPath: string, options?: {
    isDev?: boolean;
}): RouteHandlerMatch | null;
export declare function resolveLegacyRouteHandlerPath(cwd: string, requestPath: string): string | null;
export declare function runLegacyApiRoute(options: {
    req: express.Request;
    res: express.Response;
    apiPath: string;
    isDev: boolean;
    params?: RouteParams;
}): Promise<void>;
export declare function runTypedApiRoute(options: {
    req: express.Request;
    res: express.Response;
    cwd: string;
    isDev: boolean;
    config: ResolvedTypedApiConfig;
}): Promise<boolean>;
