/**
 * Vista Client Boundary Component
 * 
 * Wraps client components during SSR to add hydration markers.
 * These markers allow the client bundle to find and hydrate only client components.
 */

import * as React from 'react';
import * as fs from 'fs';
import * as path from 'path';

// Cache for component detection
const clientComponentCache = new Map<string, boolean>();

/**
 * Check if a file is a client component by checking for 'use client' directive
 */
function isClientComponent(filePath: string): boolean {
    if (clientComponentCache.has(filePath)) {
        return clientComponentCache.get(filePath)!;
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let trimmed = content;
        while (true) {
            trimmed = trimmed.trimStart();
            if (trimmed.startsWith('//')) {
                const newlineIndex = trimmed.indexOf('\n');
                trimmed = newlineIndex === -1 ? '' : trimmed.slice(newlineIndex + 1);
                continue;
            }
            if (trimmed.startsWith('/*')) {
                const commentEndIndex = trimmed.indexOf('*/');
                if (commentEndIndex === -1) {
                    break;
                }
                trimmed = trimmed.slice(commentEndIndex + 2);
                continue;
            }
            break;
        }
        const isClient = trimmed.startsWith("'use client'") || 
                        trimmed.startsWith('"use client"');
        clientComponentCache.set(filePath, isClient);
        return isClient;
    } catch {
        return false;
    }
}

// Counter for unique mount IDs
let mountCounter = 0;

/**
 * Reset mount counter at the start of each request
 */
export function resetMountCounter(): void {
    mountCounter = 0;
}

/**
 * Generate unique mount ID
 */
function generateMountId(): string {
    return `vista-client-${++mountCounter}`;
}

interface ClientBoundaryProps {
    componentId: string;
    componentPath?: string;
    children: React.ReactNode;
    props?: Record<string, any>;
}

/**
 * ClientBoundary - Wraps client components with hydration markers
 * 
 * During SSR, this component renders:
 * <div data-vista-client="counter" data-props="{}">
 *   {children from SSR}
 * </div>
 * 
 * The client then hydrates only these marked islands.
 */
export function ClientBoundary({ componentId, children, props = {} }: ClientBoundaryProps): React.ReactElement {
    const mountId = generateMountId();
    
    // Serialize props (exclude functions and React elements)
    const safeProps: Record<string, any> = {};
    for (const [key, value] of Object.entries(props)) {
        if (typeof value !== 'function' && !React.isValidElement(value)) {
            safeProps[key] = value;
        }
    }
    
    return React.createElement('div', {
        id: mountId,
        'data-vista-client': componentId,
        'data-props': JSON.stringify(safeProps),
        style: { display: 'contents' } // Don't affect layout
    }, children);
}

/**
 * Higher-order function to wrap a client component
 */
export function wrapClientComponent<P extends object>(
    Component: React.ComponentType<P>,
    componentId: string
): React.FC<P> {
    return function WrappedClientComponent(props: P) {
        const children = React.createElement(Component, props);
        return React.createElement(ClientBoundary, {
            componentId,
            props: props as Record<string, any>,
            children,
        });
    };
}


/**
 * Check if we're on the server
 */
export function isServer(): boolean {
    return typeof window === 'undefined';
}

export default {
    ClientBoundary,
    wrapClientComponent,
    resetMountCounter,
    isClientComponent,
    isServer,
};
