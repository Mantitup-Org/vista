import type express from 'express';
import type { ResolvedSegmentConfig } from './segment-config';
export interface RequestContext {
    req?: express.Request;
    res?: express.Response;
    cwd?: string;
    vistaDirRoot?: string;
    urlPath?: string;
    segmentConfig?: ResolvedSegmentConfig;
    usedTags: Set<string>;
    revalidatedTags: Set<string>;
    revalidatedPaths: Set<string>;
}
export interface RequestContextSeed {
    req?: express.Request;
    res?: express.Response;
    cwd?: string;
    vistaDirRoot?: string;
    urlPath?: string;
    segmentConfig?: ResolvedSegmentConfig;
}
export declare function runWithRequestContext<T>(seed: RequestContextSeed, callback: () => T): T;
export declare function getRequestContext(): RequestContext | undefined;
export declare function setCurrentSegmentConfig(segmentConfig: ResolvedSegmentConfig | undefined): void;
export declare function getCurrentSegmentConfig(): ResolvedSegmentConfig | undefined;
export declare function trackCacheTags(tags: Iterable<string> | undefined): void;
export declare function consumeTrackedTags(): string[];
export declare function consumeRevalidatedTags(): string[];
export declare function consumeRevalidatedPaths(): string[];
export declare function recordRevalidatedTag(tag: string): void;
export declare function recordRevalidatedPath(urlPath: string): void;
