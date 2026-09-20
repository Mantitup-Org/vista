/**
 * Vista Error Overlay
 *
 * Standalone dev error UI with Next.js-style pagination and controls.
 */
import React from 'react';
export interface VistaErrorLocation {
    file: string;
    line?: number;
    column?: number;
    codeFrame?: string;
    kind?: 'source' | 'server' | 'client' | 'log';
}
export interface VistaError {
    type: 'build' | 'runtime' | 'hydration';
    source?: 'server' | 'client';
    message: string;
    stack?: string;
    file?: string;
    line?: number;
    column?: number;
    codeFrame?: string;
    related?: VistaErrorLocation[];
    hint?: string;
}
interface ErrorOverlayProps {
    errors: VistaError[];
}
export declare function fromCaughtError(error: unknown, options?: {
    type?: VistaError['type'];
    source?: 'server' | 'client';
}): VistaError;
/**
 * Render a full HTML error page.
 * Engines should send this directly: `res.status(500).send(renderErrorHTML(...))`.
 */
export declare function renderErrorHTML(errors: VistaError[]): string;
export declare function ErrorOverlay({ errors }: ErrorOverlayProps): React.ReactElement;
export declare class DevErrorBoundary extends React.Component<{
    children: React.ReactNode;
}, {
    hasError: boolean;
    error: Error | null;
}> {
    constructor(props: any);
    static getDerivedStateFromError(error: Error): {
        hasError: boolean;
        error: Error;
    };
    render(): string | number | bigint | boolean | import("react/jsx-runtime").JSX.Element | Iterable<React.ReactNode> | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode>>;
}
export { ErrorOverlay as VistaErrorOverlay };
export { DevErrorBoundary as VistaDevErrorBoundary };
