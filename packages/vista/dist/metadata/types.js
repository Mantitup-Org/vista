"use strict";
/**
 * Vista Metadata Types
 *
 * Complete TypeScript types for Next.js-compatible metadata API.
 * Supports static `metadata` exports and dynamic `generateMetadata` function.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTemplateString = isTemplateString;
// ============================================================================
// Export type guard
// ============================================================================
function isTemplateString(title) {
    if (typeof title !== 'object' || title === null)
        return false;
    return 'default' in title || 'absolute' in title || 'template' in title;
}
