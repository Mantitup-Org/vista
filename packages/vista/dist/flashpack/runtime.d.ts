export type FlashpackPhase = 'dev' | 'build' | 'start';
export type FlashpackMode = 'development' | 'production';
export interface FlashpackPrepareOptions {
    cwd: string;
    phase: FlashpackPhase;
    mode: FlashpackMode;
    allowFallback?: boolean;
}
export interface FlashpackPrepareResult {
    flashDir: string;
    rustPipelineUsed: boolean;
    workspaceRoot: string | null;
    graphPath: string;
}
export declare function flashpackPlatformTriple(): string;
export declare function flashpackBinaryName(): string;
export declare function findBundledFlashpackBinary(startCwd?: string): string | null;
export declare function resolveFlashpackSsrRunner(startCwd?: string): string | null;
export interface FlashpackLaunch {
    command: string;
    args: string[];
    cwd: string;
    source: 'binary' | 'workspace';
}
export declare function resolveFlashpackLaunch(startCwd?: string): FlashpackLaunch;
export declare function findFlashpackWorkspaceRoot(startCwd: string): string | null;
export declare function bootstrapFlashDirectories(cwd: string): string;
export declare function resolveCargoCommand(): string;
export interface FlashpackRustCliOptions {
    cwd: string;
    phase: FlashpackPhase;
    mode: FlashpackMode;
    action?: 'prepare' | 'run';
    runnerPath?: string;
    nodeCommand?: string;
    port?: number | string;
}
export interface FlashpackRustCliResult {
    flashDir: string;
    workspaceRoot: string | null;
    cargoCommand: string | null;
    args: string[];
    logPath: string;
    graphPath: string;
    runtimeManifestPath: string;
    error?: string;
    status: number | null;
}
export declare function runFlashpackRustCli(options: FlashpackRustCliOptions): FlashpackRustCliResult;
export declare function flashpackCratesBound(flashDir: string): boolean;
export declare function prepareFlashpackRuntime(options: FlashpackPrepareOptions): FlashpackPrepareResult;
