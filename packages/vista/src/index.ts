export * from './router';
export * from './components';
export * from './auth';
export * from './types';
export * from './dev-error';

// Client-side features
export { useRouter } from './client/router';
export {
  usePathname,
  useSearchParams,
  useParams,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from './client/navigation';
export { default as dynamic } from './client/dynamic';
export { default as Script } from './client/script';
export { default as Head, generateMetadataHead } from './client/head';
export type { Metadata as HeadMetadata } from './client/head';

// Font exports
export * from './font/index';

// Metadata exports (Next.js compatible)
export * from './metadata';
export type { Metadata } from './metadata/types';

// RSC (React Server Components) exports
export { hydrateClientComponents, initializeHydration } from './client/hydration';
export { Client } from './components/client';
export { RSCRouter, RSCRouterContext, useRSCRouter } from './client/rsc-router';
export type { RSCRouterProps, RSCNavigationState, NavigationOptions } from './client/rsc-router';
export { callServer } from './client/server-actions';

// Build system exports (for advanced usage)
export type { ClientManifest, ClientComponentEntry } from './build/rsc/client-manifest';
export type { ServerManifest, ServerComponentEntry, RouteEntry } from './build/rsc/server-manifest';

// Configuration & Deployment
export * from './config';
export * from './deployment';
