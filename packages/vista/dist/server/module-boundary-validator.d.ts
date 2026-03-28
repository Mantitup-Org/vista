export interface ModuleBoundaryIssue {
    code: 'CLIENT_HOOKS_IN_SERVER_COMPONENT' | 'CLIENT_IMPORTS_SERVER_ONLY_API' | 'CLIENT_IMPORTS_NODE_BUILTIN' | 'CLIENT_DEFINES_SERVER_ACTION' | 'CLIENT_DEFINES_USE_CACHE' | 'SERVER_IMPORTS_BROWSER_ONLY_MODULE' | 'INVALID_SEGMENT_CONFIG' | 'UNSUPPORTED_SEGMENT_RUNTIME' | 'EDGE_RUNTIME_GENERATE_STATIC_PARAMS' | 'USE_CACHE_NOT_ENABLED';
    filePath: string;
    message: string;
    fix?: string;
}
export interface ValidateModuleBoundariesInput {
    appDir: string;
    extraRoots?: string[];
    cacheComponentsEnabled?: boolean;
}
export interface ValidateModuleBoundariesResult {
    issues: ModuleBoundaryIssue[];
}
export declare function validateModuleBoundaries(input: ValidateModuleBoundariesInput): ValidateModuleBoundariesResult;
