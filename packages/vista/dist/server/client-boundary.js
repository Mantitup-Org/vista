"use strict";
/**
 * Vista Client Boundary Component
 *
 * Wraps client components during SSR to add hydration markers.
 * These markers allow the client bundle to find and hydrate only client components.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetMountCounter = resetMountCounter;
exports.ClientBoundary = ClientBoundary;
exports.wrapClientComponent = wrapClientComponent;
exports.isServer = isServer;
const React = __importStar(require("react"));
const fs = __importStar(require("fs"));
// Cache for component detection
const clientComponentCache = new Map();
/**
 * Check if a file is a client component by checking for 'use client' directive
 */
function isClientComponent(filePath) {
    if (clientComponentCache.has(filePath)) {
        return clientComponentCache.get(filePath);
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
    }
    catch {
        return false;
    }
}
// Counter for unique mount IDs
let mountCounter = 0;
/**
 * Reset mount counter at the start of each request
 */
function resetMountCounter() {
    mountCounter = 0;
}
/**
 * Generate unique mount ID
 */
function generateMountId() {
    return `vista-client-${++mountCounter}`;
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
function ClientBoundary({ componentId, children, props = {} }) {
    const mountId = generateMountId();
    // Serialize props (exclude functions and React elements)
    const safeProps = {};
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
function wrapClientComponent(Component, componentId) {
    return function WrappedClientComponent(props) {
        const children = React.createElement(Component, props);
        return React.createElement(ClientBoundary, {
            componentId,
            props: props,
            children,
        });
    };
}
/**
 * Check if we're on the server
 */
function isServer() {
    return typeof window === 'undefined';
}
exports.default = {
    ClientBoundary,
    wrapClientComponent,
    resetMountCounter,
    isClientComponent,
    isServer,
};
