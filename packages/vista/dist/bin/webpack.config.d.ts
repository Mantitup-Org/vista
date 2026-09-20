import webpack from 'webpack';
import type { DeployOutput, VistaEngineVariant } from '../config';
export interface WebpackConfigOptions {
    cwd: string;
    isDev: boolean;
    engineVariant?: VistaEngineVariant;
    cacheComponentsEnabled?: boolean;
    imagesUnoptimized?: boolean;
    deployOutput?: DeployOutput;
}
export declare function createWebpackConfig(options: WebpackConfigOptions): webpack.Configuration;
