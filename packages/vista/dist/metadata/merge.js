"use strict";
/**
 * Next.js-compatible deep merge for Metadata objects.
 * Nested openGraph / twitter / robots / alternates / icons merge instead of replace.
 * Title templates inherit from parent layouts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepMergeMetadata = deepMergeMetadata;
exports.mergeMetadataChain = mergeMetadataChain;
exports.resolveParentTitleTemplate = resolveParentTitleTemplate;
const types_1 = require("./types");
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof URL);
}
function mergeTitle(parent, child) {
    if (child === null)
        return null;
    if (child === undefined)
        return parent;
    const parentTemplate = (0, types_1.isTemplateString)(parent) && parent.template
        ? parent.template
        : typeof parent === 'object' && parent && 'template' in parent
            ? parent.template
            : undefined;
    if (typeof child === 'string') {
        if (parentTemplate) {
            return { default: child, template: parentTemplate };
        }
        return child;
    }
    if ((0, types_1.isTemplateString)(child)) {
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
function mergeRobots(parent, child) {
    if (child === null)
        return null;
    if (child === undefined)
        return parent;
    if (typeof child === 'string' || typeof parent === 'string')
        return child;
    if (!parent || typeof parent !== 'object')
        return child;
    const merged = { ...parent, ...child };
    if (isPlainObject(parent.googleBot) && isPlainObject(child.googleBot)) {
        merged.googleBot = { ...parent.googleBot, ...child.googleBot };
    }
    return merged;
}
function mergeOpenGraph(parent, child) {
    if (child === null)
        return null;
    if (child === undefined)
        return parent;
    if (!parent)
        return child;
    return { ...parent, ...child };
}
function mergeTwitter(parent, child) {
    if (child === null)
        return null;
    if (child === undefined)
        return parent;
    if (!parent)
        return child;
    return { ...parent, ...child };
}
function mergeIcons(parent, child) {
    if (child === null)
        return null;
    if (child === undefined)
        return parent;
    if (!parent || typeof parent !== 'object' || Array.isArray(parent) || parent instanceof URL) {
        return child;
    }
    if (!child || typeof child !== 'object' || Array.isArray(child) || child instanceof URL) {
        return child;
    }
    if ('url' in child)
        return child;
    return { ...parent, ...child };
}
function mergeAlternates(parent, child) {
    if (child === null)
        return null;
    if (child === undefined)
        return parent;
    if (!parent)
        return child;
    return {
        ...parent,
        ...child,
        languages: { ...(parent.languages || {}), ...(child.languages || {}) },
        media: { ...(parent.media || {}), ...(child.media || {}) },
        types: { ...(parent.types || {}), ...(child.types || {}) },
    };
}
/**
 * Deep-merge parent layout metadata with child page/layout metadata.
 * Child wins on scalar fields; nested objects merge.
 */
function deepMergeMetadata(parent, child) {
    const base = parent && typeof parent === 'object' ? { ...parent } : {};
    if (!child || typeof child !== 'object')
        return base;
    const next = { ...base, ...child };
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
    if ((isPlainObject(base.appleWebApp) || typeof base.appleWebApp === 'boolean') &&
        (isPlainObject(child.appleWebApp) || typeof child.appleWebApp === 'boolean')) {
        if (typeof child.appleWebApp === 'boolean' || typeof base.appleWebApp === 'boolean') {
            next.appleWebApp = child.appleWebApp !== undefined ? child.appleWebApp : base.appleWebApp;
        }
        else {
            next.appleWebApp = { ...base.appleWebApp, ...child.appleWebApp };
        }
    }
    if (base.metadataBase && child.metadataBase === undefined) {
        next.metadataBase = base.metadataBase;
    }
    return next;
}
/** Fold a chain of metadata objects (root → … → page). */
function mergeMetadataChain(chain) {
    return chain.reduce((acc, item) => deepMergeMetadata(acc, item), {});
}
/**
 * Resolve the active title template string from merged metadata (for generateMetadataHtml).
 */
function resolveParentTitleTemplate(metadata) {
    if (!metadata?.title)
        return undefined;
    if ((0, types_1.isTemplateString)(metadata.title))
        return metadata.title.template;
    return undefined;
}
