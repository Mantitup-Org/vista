import webpack from 'webpack';
import type { VistaEngineVariant } from '../config';
export interface WebpackConfigOptions {
    cwd: string;
    isDev: boolean;
    engineVariant?: VistaEngineVariant;
    cacheComponentsEnabled?: boolean;
}
export declare function createWebpackConfig(options: WebpackConfigOptions): webpack.Configuration;
