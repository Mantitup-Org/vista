interface DeployOutputOptions {
    cwd: string;
    vistaDir: string;
    debug?: boolean;
    adapter?: string;
}
export declare function generateDeploymentOutputs(options: DeployOutputOptions): void;
export {};
