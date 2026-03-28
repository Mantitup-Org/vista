import type { RouteEntry } from '../build/rsc/server-manifest';
import type { VistaConfig } from '../config';
export interface PartialPrerenderInfo {
    enabled: boolean;
    strategy: 'loading-boundary';
    shellArtifact: string;
    resumePath: string;
}
export type PprRequestMode = 'default' | 'shell' | 'resume';
export declare function isAppPPREnabled(config: VistaConfig): boolean;
export declare function isRoutePPREligible(route: RouteEntry, appPprEnabled: boolean): boolean;
export declare function getPprShellArtifactPath(urlPath: string): string;
export declare function createPartialPrerenderInfo(urlPath: string): PartialPrerenderInfo;
export declare function resolvePprRequestMode(input: {
    headerValue?: unknown;
    queryValue?: unknown;
}): PprRequestMode;
export declare function injectPprResumeBootstrap(shellHtml: string, urlPath: string): string;
