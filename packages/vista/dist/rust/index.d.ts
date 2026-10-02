export interface ClassifiedSegment {
    kind: string;
    segment: string;
}
export declare function nativeBindingsLoaded(): boolean;
export declare function classifyAppSegment(folder: string): ClassifiedSegment;
export declare function routePattern(folders: string[]): string;
export declare function encodeVistaErrorCode(code: string): string;
export declare function findVistaErrorCodes(source: string): string[];
export declare function tasklessSteps(enabled: boolean): string[];
export declare function classifyAppSegmentFallback(folder: string): ClassifiedSegment;
export declare function routePatternFallback(folders: string[]): string;
export declare function readBoundPipeline(cwd?: string): Record<string, unknown> | null;
