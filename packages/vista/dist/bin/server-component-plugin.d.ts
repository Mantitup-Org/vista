/**
 * Vista Server Component Webpack Plugin
 *
 * Checks for server/client boundary violations and invalid route segment
 * config on every webpack compilation.
 */
import type { Compiler } from 'webpack';
export declare class VistaServerComponentPlugin {
    private appDir;
    private componentsDir?;
    private cacheComponentsEnabled;
    constructor(options: {
        appDir: string;
        componentsDir?: string;
        cacheComponentsEnabled?: boolean;
    });
    apply(compiler: Compiler): void;
}
export default VistaServerComponentPlugin;
