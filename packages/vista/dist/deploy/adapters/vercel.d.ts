import type { BuildHookOptions, DeployAdapter } from '../types';
export declare function isVercelBuildEnvironment(): boolean;
export declare function hasUserVercelConfig(cwd: string): boolean;
export declare function writeVercelBuildOutput(options: BuildHookOptions & {
    force?: boolean;
}): boolean;
export declare const vercelAdapter: DeployAdapter;
