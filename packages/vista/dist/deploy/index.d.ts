import type { DeployResult } from './types';
export { writeVercelBuildOutput, isVercelBuildEnvironment, hasUserVercelConfig } from './adapters/vercel';
export { resolveDeployTarget, listKnownTargets } from './detect';
export type { DeployContext, DeployResult, DeployAdapter, ResolvedDeployTarget } from './types';
export interface RunDeployOptions {
    cwd?: string;
    target?: string | null;
    dryRun?: boolean;
    skipBuild?: boolean;
    prod?: boolean;
    preview?: boolean;
    force?: boolean;
    debug?: boolean;
    log?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
    build?: (cwd: string) => Promise<void>;
}
export declare function runDeploy(options?: RunDeployOptions): Promise<DeployResult>;
export declare function generateDeploymentOutputs(options: {
    cwd: string;
    vistaDir: string;
    debug?: boolean;
}): void;
