type InterceptionMarker = '(.)' | '(..)' | '(..)(..)' | '(...)';
export interface MatchedAppModule {
    filePath: string;
    params: Record<string, string>;
    source: 'page' | 'default' | 'interception';
}
export interface ParallelSlotMatch extends MatchedAppModule {
    slotName: string;
    slotRootDir: string;
}
export declare function resolveConventionModule(dir: string, stem: string): string | null;
export declare function parseInterceptionSegment(segment: string): {
    marker: InterceptionMarker;
    target: string;
} | null;
export declare function isInterceptionRouteSegment(segment: string): boolean;
export declare function isRouteGroupSegment(segment: string): boolean;
export declare function isParallelRouteSegment(segment: string): boolean;
export declare function resolveParallelSlotMatches(input: {
    appDir: string;
    layoutPath: string;
    pathname: string;
}): ParallelSlotMatch[];
export declare function resolveDirectoryChain(rootDir: string, entryFilePath: string): string[];
export declare function resolveNearestSegmentNotFoundPath(appDir: string, startDir: string): string | null;
export {};
