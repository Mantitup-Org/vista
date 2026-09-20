export declare function isBootstrapChunkFile(filename: string): boolean;
export declare function sortHydrationChunkFiles(files: string[]): string[];
/**
 * Script tags that must be in the HTML document. Async `clientN-*.js`
 * chunks are loaded by the webpack runtime, matching Next.js.
 */
export declare function listHydrationChunkFiles(cwd: string, isDev?: boolean): string[];
