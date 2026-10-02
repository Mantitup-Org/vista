/**
 * Vista Metadata Module
 *
 * Re-exports all metadata-related types and utilities.
 */

export * from './types';
export { MetadataRenderer, generateMetadataHtml } from './generate';
export { deepMergeMetadata, mergeMetadataChain, resolveParentTitleTemplate } from './merge';
export {
  robots,
  sitemap,
  manifest,
  serializeRobots,
  serializeSitemap,
  metadataRouteToResponse,
  MetadataRoute,
} from './routes';
export type {
  RobotsFile,
  RobotsRule,
  SitemapFile,
  SitemapEntry,
  ManifestFile,
  ManifestIcon,
} from './routes';
export { jsonLd, JsonLd } from './json-ld';
export type { JsonLdProps } from './json-ld';
