/**
 * Next.js-compatible deep merge for Metadata objects.
 * Nested openGraph / twitter / robots / alternates / icons merge instead of replace.
 * Title templates inherit from parent layouts.
 */
import type { Metadata } from './types';
/**
 * Deep-merge parent layout metadata with child page/layout metadata.
 * Child wins on scalar fields; nested objects merge.
 */
export declare function deepMergeMetadata(parent: Metadata | null | undefined, child: Metadata | null | undefined): Metadata;
/** Fold a chain of metadata objects (root → … → page). */
export declare function mergeMetadataChain(chain: Array<Metadata | null | undefined>): Metadata;
/**
 * Resolve the active title template string from merged metadata (for generateMetadataHtml).
 */
export declare function resolveParentTitleTemplate(metadata: Metadata | null | undefined): string | undefined;
