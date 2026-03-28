export interface ProjectAliasResolver {
    resolve: (request: string) => string | null;
}
export declare function createProjectAliasResolver(cwd: string, resolveFromWorkspace: (specifier: string, cwd: string) => string): ProjectAliasResolver | null;
