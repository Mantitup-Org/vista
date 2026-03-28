import type express from 'express';
import type { ResolvedTypedApiConfig } from '../config';
export declare function resolveLegacyApiRoutePath(cwd: string, requestPath: string): string | null;
export declare function resolveLegacyRouteHandlerPath(cwd: string, requestPath: string): string | null;
export declare function runLegacyApiRoute(options: {
    req: express.Request;
    res: express.Response;
    apiPath: string;
    isDev: boolean;
}): Promise<void>;
export declare function runTypedApiRoute(options: {
    req: express.Request;
    res: express.Response;
    cwd: string;
    isDev: boolean;
    config: ResolvedTypedApiConfig;
}): Promise<boolean>;
