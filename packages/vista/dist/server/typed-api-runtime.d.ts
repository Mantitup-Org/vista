import type express from 'express';
import type { ResolvedTypedApiConfig } from '../config';
export interface RouteHandlerMatch {
    filePath: string;
    params: Record<string, string | string[]>;
}
export declare function resolveRouteHandlerMatch(cwd: string, requestPath: string): RouteHandlerMatch | null;
export declare function resolveLegacyApiRoutePath(cwd: string, requestPath: string): string | null;
export declare function resolveLegacyRouteHandlerPath(cwd: string, requestPath: string): string | null;
export declare function runLegacyApiRoute(options: {
    req: express.Request;
    res: express.Response;
    apiPath: string;
    isDev: boolean;
    params?: Record<string, string | string[]>;
}): Promise<void>;
export declare function runTypedApiRoute(options: {
    req: express.Request;
    res: express.Response;
    cwd: string;
    isDev: boolean;
    config: ResolvedTypedApiConfig;
}): Promise<boolean>;
