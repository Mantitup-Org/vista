/**
 * Vista Flight Loader
 * 
 * Rust-powered webpack loader that detects 'use client' directive
 * and marks modules with RSC info for proper bundle separation.
 * 
 * This is similar to Next.js's flight-loader but uses Vista's Rust scanner.
 */

import type { LoaderContext } from 'webpack';

// Type for the module's build info
interface VistaBuildInfo {
    rsc?: {
        isClientRef: boolean;
        type: 'client' | 'server';
        directiveLine?: number;
    };
}

// Try to load Rust native bindings
let nativeBindings: {
    isClientComponent: (source: string) => boolean;
    analyzeClientDirective: (source: string) => { isClient: boolean; directiveLine: number };
} | null = null;

try {
    nativeBindings = require('../../../../crates/vista-napi');
} catch (e) {
    // Fall back to TypeScript implementation
}

/**
 * Fallback TypeScript implementation of client directive detection
 */
function hasClientDirective(source: string): boolean {
    const lines = source.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
            continue;
        }
        
        // Check for 'use client' directive
        if (trimmed === "'use client';" || trimmed === '"use client";' ||
            trimmed === "'use client'" || trimmed === '"use client"') {
            return true;
        }
        
        // If we hit an import or other statement first, it's not a client component
        if (trimmed.startsWith('import') || trimmed.startsWith('export') || 
            trimmed.startsWith('const') || trimmed.startsWith('function')) {
            return false;
        }
    }
    return false;
}

/**
 * Vista Flight Loader
 * 
 * Marks modules with RSC info based on 'use client' directive.
 * Uses Rust for detection when available, falls back to TypeScript.
 */
export default function vistaFlightLoader(
    this: LoaderContext<{}>,
    source: string
): string {
    // Get module's build info
    const buildInfo = (this._module as any).buildInfo as VistaBuildInfo;
    const fileName = this.resourcePath.split(/[\\/]/).pop() || '';
    
    // Only process app directory files
    if (!this.resourcePath.includes('app')) {
        return source;
    }
    
    if (!buildInfo.rsc) {
        // Detect directive using Rust or fallback
        let isClient = false;
        let directiveLine = 0;
        
        if (nativeBindings) {
            try {
                const result = nativeBindings.analyzeClientDirective(source);
                isClient = result.isClient;
                directiveLine = result.directiveLine;
            } catch (e) {
                // Fallback if Rust call fails
                isClient = hasClientDirective(source);
            }
        } else {
            isClient = hasClientDirective(source);
        }
        
        // Mark module with RSC info (like Next.js does)
        buildInfo.rsc = {
            isClientRef: isClient,
            type: isClient ? 'client' : 'server',
            directiveLine
        };
        
        // Debug logging (only when VISTA_DEBUG is set)
        if (process.env.VISTA_DEBUG && isClient) {
            console.log(`[Vista Flight Loader] ${fileName}: isClient=${isClient}`);
        }
    }
    
    // Pass through source unchanged
    // The loader's job is just to mark modules, not transform code
    return source;
}


// Allow async loading
export const raw = false;
