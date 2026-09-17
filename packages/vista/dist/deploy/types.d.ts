import type { DeployTarget, ResolvedDeployConfig, VistaConfig } from '../config';
export type ResolvedDeployTarget = Exclude<DeployTarget, 'auto'>;
export type DeployResultStatus = 'deployed' | 'emitted' | 'failed';
export interface DeployContext {
    cwd: string;
    vistaDir: string;
    config: VistaConfig;
    deployConfig: ResolvedDeployConfig;
    target: ResolvedDeployTarget;
    dryRun: boolean;
    skipBuild: boolean;
    prod: boolean;
    preview: boolean;
    force: boolean;
    debug?: boolean;
    log?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
}
export interface DeployResult {
    status: DeployResultStatus;
    target: ResolvedDeployTarget;
    url?: string;
    artifactPaths?: string[];
    instructions?: string[];
    warnings?: string[];
}
export interface DeployAdapter {
    id: ResolvedDeployTarget;
    requiredOutput: 'standalone' | 'static';
    supportsFullRuntime: boolean;
    preflight(ctx: DeployContext): Promise<string[]>;
    emit(ctx: DeployContext): Promise<DeployResult>;
    deploy(ctx: DeployContext): Promise<DeployResult>;
}
export interface CliRunResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    command: string;
    missingCli?: boolean;
}
export interface BuildHookOptions {
    cwd: string;
    vistaDir: string;
    debug?: boolean;
    force?: boolean;
}
