/**
 * Next.js-compatible deep merge for Metadata objects.
 * Nested openGraph / twitter / robots / alternates / icons merge instead of replace.
 * Title templates inherit from parent layouts.
 */

import type { Metadata, TemplateString, Robots, OpenGraph, Twitter, Icons, AlternateURLs } from './types';
import { isTemplateString } from './types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof URL);
}

function mergeTitle(
  parent: Metadata['title'],
  child: Metadata['title']
): Metadata['title'] {
  if (child === null) return null;
  if (child === undefined) return parent;

  const parentTemplate =
    isTemplateString(parent) && parent.template
      ? parent.template
      : typeof parent === 'object' && parent && 'template' in parent
        ? (parent as TemplateString).template
        : undefined;

  if (typeof child === 'string') {
    if (parentTemplate) {
      return { default: child, template: parentTemplate };
    }
    return child;
  }

  if (isTemplateString(child)) {
    if (child.absolute) {
      return {
        absolute: child.absolute,
        default: child.default ?? child.absolute,
        template: child.template ?? parentTemplate,
      };
    }
    return {
      default: child.default ?? '',
      absolute: child.absolute,
      template: child.template ?? parentTemplate,
    };
  }

  return child;
}

function mergeRobots(parent: Metadata['robots'], child: Metadata['robots']): Metadata['robots'] {
  if (child === null) return null;
  if (child === undefined) return parent;
  if (typeof child === 'string' || typeof parent === 'string') return child;
  if (!parent || typeof parent !== 'object') return child;

  const merged: Robots = { ...parent, ...child };
  if (isPlainObject(parent.googleBot) && isPlainObject(child.googleBot)) {
    merged.googleBot = { ...(parent.googleBot as Robots), ...(child.googleBot as Robots) };
  }
  return merged;
}

function mergeOpenGraph(parent: Metadata['openGraph'], child: Metadata['openGraph']): Metadata['openGraph'] {
  if (child === null) return null;
  if (child === undefined) return parent;
  if (!parent) return child;
  return { ...(parent as OpenGraph), ...(child as OpenGraph) } as OpenGraph;
}

function mergeTwitter(parent: Metadata['twitter'], child: Metadata['twitter']): Metadata['twitter'] {
  if (child === null) return null;
  if (child === undefined) return parent;
  if (!parent) return child;
  return { ...(parent as Twitter), ...(child as Twitter) } as Twitter;
}

function mergeIcons(parent: Metadata['icons'], child: Metadata['icons']): Metadata['icons'] {
  if (child === null) return null;
  if (child === undefined) return parent;
  if (!parent || typeof parent !== 'object' || Array.isArray(parent) || parent instanceof URL) {
    return child;
  }
  if (!child || typeof child !== 'object' || Array.isArray(child) || child instanceof URL) {
    return child;
  }
  if ('url' in child) return child;
  return { ...(parent as Icons), ...(child as Icons) };
}

function mergeAlternates(
  parent: Metadata['alternates'],
  child: Metadata['alternates']
): Metadata['alternates'] {
  if (child === null) return null;
  if (child === undefined) return parent;
  if (!parent) return child;
  return {
    ...parent,
    ...child,
    languages: { ...(parent.languages || {}), ...(child.languages || {}) },
    media: { ...(parent.media || {}), ...(child.media || {}) },
    types: { ...(parent.types || {}), ...(child.types || {}) },
  } as AlternateURLs;
}

/**
 * Deep-merge parent layout metadata with child page/layout metadata.
 * Child wins on scalar fields; nested objects merge.
 */
export function deepMergeMetadata(parent: Metadata | null | undefined, child: Metadata | null | undefined): Metadata {
  const base: Metadata = parent && typeof parent === 'object' ? { ...parent } : {};
  if (!child || typeof child !== 'object') return base;

  const next: Metadata = { ...base, ...child };

  next.title = mergeTitle(base.title, child.title);
  next.robots = mergeRobots(base.robots, child.robots);
  next.openGraph = mergeOpenGraph(base.openGraph, child.openGraph);
  next.twitter = mergeTwitter(base.twitter, child.twitter);
  next.icons = mergeIcons(base.icons, child.icons);
  next.alternates = mergeAlternates(base.alternates, child.alternates);

  if (isPlainObject(base.other) || isPlainObject(child.other)) {
    next.other = { ...(base.other || {}), ...(child.other || {}) };
  }

  if (isPlainObject(base.verification) || isPlainObject(child.verification)) {
    next.verification = { ...(base.verification || {}), ...(child.verification || {}) };
  }

  if (isPlainObject(base.formatDetection) || isPlainObject(child.formatDetection)) {
    next.formatDetection = { ...(base.formatDetection || {}), ...(child.formatDetection || {}) };
  }

  if (
    (isPlainObject(base.appleWebApp) || typeof base.appleWebApp === 'boolean') &&
    (isPlainObject(child.appleWebApp) || typeof child.appleWebApp === 'boolean')
  ) {
    if (typeof child.appleWebApp === 'boolean' || typeof base.appleWebApp === 'boolean') {
      next.appleWebApp = child.appleWebApp !== undefined ? child.appleWebApp : base.appleWebApp;
    } else {
      next.appleWebApp = { ...(base.appleWebApp as object), ...(child.appleWebApp as object) };
    }
  }

  if (base.metadataBase && child.metadataBase === undefined) {
    next.metadataBase = base.metadataBase;
  }

  return next;
}

/** Fold a chain of metadata objects (root → … → page). */
export function mergeMetadataChain(chain: Array<Metadata | null | undefined>): Metadata {
  return chain.reduce<Metadata>((acc, item) => deepMergeMetadata(acc, item), {});
}

/**
 * Resolve the active title template string from merged metadata (for generateMetadataHtml).
 */
export function resolveParentTitleTemplate(metadata: Metadata | null | undefined): string | undefined {
  if (!metadata?.title) return undefined;
  if (isTemplateString(metadata.title)) return metadata.title.template;
  return undefined;
}
