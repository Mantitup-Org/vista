import type { CliRunResult } from './types';
export declare function isCliAvailable(command: string): boolean;
export declare function runCliCommand(command: string, options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    dryRun?: boolean;
}): CliRunResult;
export declare function extractDeploymentUrl(output: string): string | undefined;
