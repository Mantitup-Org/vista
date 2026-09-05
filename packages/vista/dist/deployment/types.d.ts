import type { DeploymentConfig, DeploymentTarget, VistaConfig } from '../config';
export interface DeploymentContext {
    cwd: string;
    vistaDir: string;
    buildId?: string;
    config: VistaConfig;
    deploymentConfig: Required<DeploymentConfig>;
    target: DeploymentTarget;
    debug?: boolean;
}
export interface DeploymentResult {
    target: DeploymentTarget;
    success: boolean;
    outputDirectory?: string;
    generatedFiles: string[];
    notes?: string[];
}
export interface DeploymentAdapter {
    target: DeploymentTarget;
    name: string;
    generate(context: DeploymentContext): DeploymentResult;
    generateBlueprint?(context: DeploymentContext): string[];
}
