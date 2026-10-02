/**
 * SSR-safe JSON-LD helpers for structured data.
 */
import * as React from 'react';
/** Serialize structured data for embedding in a script tag. */
export declare function jsonLd(data: unknown): string;
export interface JsonLdProps {
    data: unknown;
    id?: string;
}
/**
 * Renders `<script type="application/ld+json">` with XSS-safe serialization.
 * Prefer this over hand-rolling dangerouslySetInnerHTML.
 */
export declare function JsonLd({ data, id }: JsonLdProps): React.ReactElement;
