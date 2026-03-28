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
export declare function resolveRuntimeProjectRoot(projectRoot: string, explicitRuntimeRoot?: string): string;
