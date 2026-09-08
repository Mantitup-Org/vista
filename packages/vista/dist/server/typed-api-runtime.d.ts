import type express from 'express';
import type { ResolvedTypedApiConfig } from '../config';
import type { RouteParams } from './route-patterns';
export interface RouteHandlerMatch {
    /** Absolute path of the resolved route file. */
    filePath: string;
    /** Dynamic segment values, empty for a fully static route. */
    params: RouteParams;
}
export declare function getAppDirectories(cwd: string): string[];
export declare function createParamsContext(rawParams: Record<string, string | string[]>): any;
export declare function resolveRouteHandler(cwd: string, requestPath: string, options?: {
    isDev?: boolean;
}): RouteHandlerMatch | null;
export declare const resolveRouteHandlerMatch: typeof resolveRouteHandler;
export declare function resolveLegacyApiRoutePath(cwd: string, requestPath: string): string | null;
export declare function resolveLegacyRouteHandlerPath(cwd: string, requestPath: string): string | null;
export declare function runRouteHandler(options: {
    req: express.Request;
    res: express.Response;
    apiPath: string;
    isDev: boolean;
    params?: Record<string, string | string[]>;
}): Promise<void>;
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
