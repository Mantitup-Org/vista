interface DeployOutputOptions {
    cwd: string;
    vistaDir: string;
    debug?: boolean;
}
export declare function generateDeploymentOutputs(options: DeployOutputOptions): void;
export declare function printDeployHelp(cwd?: string): void;
export {};
