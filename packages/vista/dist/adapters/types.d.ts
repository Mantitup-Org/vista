export interface DeploymentContext {
    cwd: string;
    vistaDir: string;
    outputDir?: string;
    debug?: boolean;
}
export interface DeploymentAdapter {
    name: string;
    description: string;
    build(context: DeploymentContext): Promise<void> | void;
}
