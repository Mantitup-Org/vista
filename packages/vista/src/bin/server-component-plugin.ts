/**
 * Vista Server Component Webpack Plugin
 *
 * Checks for server/client boundary violations and invalid route segment
 * config on every webpack compilation.
 */

import * as path from 'path';
import type { Compiler } from 'webpack';

import { validateModuleBoundaries } from '../server/module-boundary-validator';

export class VistaServerComponentPlugin {
    private appDir: string;
    private componentsDir?: string;
    private cacheComponentsEnabled: boolean;
    
    constructor(options: {
        appDir: string;
        componentsDir?: string;
        cacheComponentsEnabled?: boolean;
    }) {
        this.appDir = options.appDir;
        this.componentsDir = options.componentsDir;
        this.cacheComponentsEnabled = Boolean(options.cacheComponentsEnabled);
    }
    
    apply(compiler: Compiler) {
        // Use afterCompile hook so we can add errors to compilation
        compiler.hooks.afterCompile.tap('VistaServerComponentPlugin', (compilation) => {
            const errors = validateModuleBoundaries({
                appDir: this.appDir,
                extraRoots: this.componentsDir ? [this.componentsDir] : [],
                cacheComponentsEnabled: this.cacheComponentsEnabled,
            }).issues;
            
            if (errors.length > 0) {
                console.log('');
                console.log('\x1b[41m\x1b[37m ERROR \x1b[0m \x1b[31mServer/Segment Validation Error\x1b[0m');
                console.log('');
                
                for (const error of errors) {
                    const relativeFile = path.relative(this.appDir, error.filePath);
                    console.log(`\x1b[31m✗\x1b[0m ${relativeFile}`);
                    console.log(`  ${error.message}`);
                    console.log('');
                    if (error.fix) {
                        console.log(`  \x1b[36mTo fix:\x1b[0m ${error.fix}`);
                        console.log('');
                    }
                    
                    // Add webpack error so it shows in overlay
                    const WebpackError = require('webpack').WebpackError;
                    const err = new WebpackError(
                        `${error.message}\n${error.fix ? `Fix: ${error.fix}` : ''}`.trim()
                    );
                    err.file = relativeFile;
                    compilation.errors.push(err);
                }
            }
        });
    }
}

export default VistaServerComponentPlugin;
