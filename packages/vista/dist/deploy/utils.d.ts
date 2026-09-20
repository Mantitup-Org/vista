export declare function ensureDir(absolutePath: string): void;
export declare function copyDirectoryRecursive(sourceDir: string, targetDir: string, seen?: Set<string>): void;
export declare function copyFileIfPresent(sourceFile: string, targetFile: string): void;
export declare function writeFileIfAllowed(targetFile: string, content: string, force: boolean): {
    written: boolean;
    skipped: boolean;
};
export declare function readJsonSafe<T>(absolutePath: string): T | null;
export declare const STATIC_HOST_ROUTE_RULES: ({
    handle: "filesystem";
    src?: undefined;
    dest?: undefined;
} | {
    src: string;
    dest: string;
    handle?: undefined;
})[];
/** Lift `.vista/static/pages/*.html` to pretty CDN paths (`docs/foo/index.html`). */
export declare function flattenPrerenderedPages(pagesDir: string, targetDir: string): void;
/** Serve Flight files at `/rsc/*.rsc` (extension avoids file/directory collisions). */
export declare function flattenPrerenderedFlight(pagesDir: string, targetDir: string): void;
/** Copy webpack assets to `/_vista/static` and flatten HTML + Flight for file-based CDNs. */
export declare function prepareStaticCdnOutput(targetDir: string): void;
export declare function copyStaticHostAssets(cwd: string, vistaDir: string, targetDir: string): void;
