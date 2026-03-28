/**
 * RSC Webpack Compiler
 *
 * Creates separate webpack configurations for:
 * 1. Server Bundle (.vista/server/) - All app code for SSR
 * 2. Client Bundle (.vista/static/) - Only 'use client' components
 */
import webpack from 'webpack';
import { VistaDirs } from '../manifest';
import type { VistaEngineVariant } from '../../config';
export interface RSCCompilerOptions {
    cwd: string;
    isDev: boolean;
    vistaDirs: VistaDirs;
    buildId: string;
    engineVariant?: VistaEngineVariant;
    clientReferenceFiles?: string[];
}
/**
 * Create Server-Side Webpack Configuration
 *
 * Builds ALL components for server-side rendering.
 * Output goes to .vista/server/ and is NEVER sent to the client.
 */
export declare function createServerWebpackConfig(options: RSCCompilerOptions): webpack.Configuration;
/**
 * Create Client-Side Webpack Configuration (RSC-aware)
 *
 * ONLY bundles components marked with 'use client'.
 * Server components are replaced with client references.
 */
export declare function createClientWebpackConfig(options: RSCCompilerOptions): webpack.Configuration;
/**
 * Run both server and client builds
 */
export declare function runRSCBuild(cwd: string, isDev: boolean): Promise<{
    serverCompiler: webpack.Compiler;
    clientCompiler: webpack.Compiler;
}>;
