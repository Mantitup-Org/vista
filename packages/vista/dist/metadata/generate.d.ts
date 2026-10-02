/**
 * Vista Metadata Renderer
 *
 * Converts Metadata object to React head elements.
 * Used by server for SSR and can be used client-side.
 */
import * as React from 'react';
import type { Metadata } from './types';
export interface MetadataRendererProps {
    metadata: Metadata;
    parentTemplate?: string;
}
/**
 * Renders metadata as React head elements.
 * Returns an array of elements to be placed in <head>.
 */
export declare function MetadataRenderer({ metadata, parentTemplate, }: MetadataRendererProps): React.ReactElement;
/**
 * Converts metadata to HTML string for SSR injection.
 * Applies title template from merged metadata when parentTemplate is omitted.
 */
export declare function generateMetadataHtml(metadata: Metadata, parentTemplate?: string): string;
export default MetadataRenderer;
