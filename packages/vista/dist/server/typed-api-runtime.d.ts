import type express from 'express';
import type { ResolvedTypedApiConfig } from '../config';
export interface ResolvedRouteHandler {
    filePath: string;
    params: Record<string, string | string[]>;
}
export interface DiscoveredRouteSegment {
    raw: string;
    isDynamic: boolean;
    isCatchAll: boolean;
    isOptionalCatchAll: boolean;
    paramName: string;
    score: number;
}
export interface DiscoveredRouteHandler {
    filePath: string;
    segments: DiscoveredRouteSegment[];
    score: number;
    isDirectFile?: boolean;
}
export declare function resolveRouteHandler(cwd: string, requestPath: string): ResolvedRouteHandler | null;
export declare function resolveLegacyApiRoutePath(cwd: string, requestPath: string): string | null;
export declare function resolveLegacyRouteHandlerPath(cwd: string, requestPath: string): string | null;
export declare function createParamsContext(rawParams: Record<string, string | string[]>): any;
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
