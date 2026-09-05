import type { DeploymentConfig, DeploymentTarget } from '../config';
export declare function normalizeDeploymentTarget(raw: unknown): DeploymentTarget | null;
export declare function detectDeploymentTarget(cwd: string, deploymentConfig?: DeploymentConfig, explicitTarget?: string): DeploymentTarget;
