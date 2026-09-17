import type { DeployTarget, ResolvedDeployConfig } from '../config';
import type { ResolvedDeployTarget } from './types';
export declare function normalizeResolvedTarget(raw: unknown): ResolvedDeployTarget | null;
export declare function resolveDeployTarget(cwd: string, deployConfig: ResolvedDeployConfig, cliTarget?: string | null): ResolvedDeployTarget;
export declare function resolveEffectiveOutput(deployConfig: ResolvedDeployConfig, target: ResolvedDeployTarget): 'standalone' | 'static' | 'hybrid';
export declare function listKnownTargets(): DeployTarget[];
