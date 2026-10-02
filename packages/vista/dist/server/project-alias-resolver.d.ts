export interface ProjectAliasResolver {
    resolve: (request: string) => string | null;
}
export declare function createProjectAliasResolver(cwd: string, resolveFromWorkspace: (specifier: string, cwd: string) => string): ProjectAliasResolver | null;
/**
 * Webpack resolve.alias entries for the project's tsconfig/jsconfig `paths`.
 * Wildcard `@/*` becomes the prefix alias `@` so client bundles resolve `@/data/site`.
 */
export declare function loadProjectWebpackAliases(cwd: string): Record<string, string>;
/** True when a module request is covered by a webpack path alias. */
export declare function requestUsesProjectAlias(request: string, aliases: Record<string, string>): boolean;
