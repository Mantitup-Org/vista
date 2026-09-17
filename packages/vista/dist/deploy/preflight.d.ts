import type { DeployContext } from './types';
export declare function validateBuildArtifacts(ctx: DeployContext): string[];
export declare function runStaticHostPreflight(ctx: DeployContext): Promise<string[]>;
export declare function runStandalonePreflight(ctx: DeployContext): Promise<string[]>;
export declare function splitPreflightMessages(messages: string[]): {
    errors: string[];
    warnings: string[];
};
