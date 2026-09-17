export declare function ensureDir(absolutePath: string): void;
export declare function copyDirectoryRecursive(sourceDir: string, targetDir: string): void;
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
export declare function copyStaticHostAssets(cwd: string, vistaDir: string, targetDir: string): void;
