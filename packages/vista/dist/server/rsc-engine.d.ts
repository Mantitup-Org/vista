/**
 * Vista RSC Web Engine
 *
 * Serves SSR HTML and proxies Flight requests to a dedicated upstream process
 * that runs with `--conditions react-server`.
 *
 * SSR renders Flight streams into HTML using renderToPipeableStream,
 * with a shim __webpack_require__ to resolve client modules during SSR.
 */
import webpack from 'webpack';
export interface RSCEngineOptions {
    port?: number;
    compiler?: webpack.Compiler | null;
    projectRoot?: string;
    runtimeRoot?: string;
}
export declare function startRSCServer(options?: RSCEngineOptions): void;
export { startRSCServer as default };
