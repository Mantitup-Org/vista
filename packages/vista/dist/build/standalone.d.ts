import type { ServerManifest } from './rsc/server-manifest';
export interface RuntimeArtifactsManifest {
    schemaVersion: number;
    buildId: string;
    generatedAt: string;
    runtimeRootRelative: string;
    frameworkRuntimeRelative: string;
    standaloneServerRelative: string;
    fileTraceRelative: string;
    dependencyRootsRelative: string[];
}
export interface FileTraceManifest {
    schemaVersion: number;
    buildId: string;
    generatedAt: string;
    projectRoot: string;
    runtimeRootRelative: string;
    frameworkRuntimeRelative: string;
    copiedFiles: string[];
    copiedDirectories: string[];
    rewrittenArtifacts: string[];
}
interface StandaloneOutputOptions {
    cwd: string;
    vistaDir: string;
    buildId: string;
    serverManifest: ServerManifest;
    debug?: boolean;
}
export declare function generateStandaloneOutput(options: StandaloneOutputOptions): void;
export {};
