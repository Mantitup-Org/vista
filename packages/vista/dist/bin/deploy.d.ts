export interface RunDeployCommandOptions {
    cwd?: string;
    log?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
}
export declare function runDeployCommand(flags: string[], options?: RunDeployCommandOptions): Promise<number>;
