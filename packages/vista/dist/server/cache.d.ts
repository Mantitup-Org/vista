export interface CacheLifeOptions {
    revalidate?: number | false;
    tags?: string[];
}
export declare function unstable_cache<TArgs extends unknown[], TResult>(callback: (...args: TArgs) => Promise<TResult> | TResult, keyParts?: string[], options?: CacheLifeOptions): (...args: TArgs) => Promise<TResult>;
export declare function cacheTag(...tags: string[]): void;
export declare function cacheLife(profile?: number | false | CacheLifeOptions | undefined): void;
export declare function wrapModuleUseCacheExport<T>(value: T, filePath: string, exportName: string): T;
export declare function revalidateTag(tag: string): void;
export declare function revalidatePath(urlPath: string): void;
