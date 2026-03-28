export declare const SEGMENT_CONFIG_EXPORTS: readonly ["dynamic", "revalidate", "runtime", "preferredRegion", "maxDuration", "fetchCache"];
export type SegmentConfigExportName = (typeof SEGMENT_CONFIG_EXPORTS)[number];
export type SegmentDynamicMode = 'auto' | 'force-dynamic' | 'force-static' | 'error';
export type SegmentRuntime = 'nodejs' | 'edge' | 'experimental-edge';
export type SegmentFetchCache = 'auto' | 'default-cache' | 'only-cache' | 'force-cache' | 'default-no-store' | 'only-no-store' | 'force-no-store';
export interface SegmentConfig {
    dynamic?: SegmentDynamicMode;
    revalidate?: number | false;
    runtime?: SegmentRuntime;
    preferredRegion?: string | string[];
    maxDuration?: number;
    fetchCache?: SegmentFetchCache;
}
export interface SegmentConfigIssue {
    filePath: string;
    exportName: SegmentConfigExportName;
    message: string;
    fix?: string;
}
export interface SegmentConfigParseResult {
    config: SegmentConfig;
    issues: SegmentConfigIssue[];
}
export interface ResolvedSegmentConfig extends SegmentConfig {
    runtime: SegmentRuntime;
    fetchCache: SegmentFetchCache;
    dynamic: SegmentDynamicMode;
}
export interface RouteSegmentComponent {
    absolutePath: string;
    segmentConfig?: SegmentConfig;
}
export declare function hasUseClientDirective(source: string): boolean;
export declare function hasUseServerDirective(source: string): boolean;
export declare function parseSegmentConfig(source: string, filePath: string): SegmentConfigParseResult;
export declare function mergeSegmentConfigs(components: Array<RouteSegmentComponent | undefined>): ResolvedSegmentConfig;
export declare function getSegmentConfigExportNames(source: string): SegmentConfigExportName[];
