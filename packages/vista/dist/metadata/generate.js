"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetadataRenderer = MetadataRenderer;
exports.generateMetadataHtml = generateMetadataHtml;
const jsx_runtime_1 = require("react/jsx-runtime");
const merge_1 = require("./merge");
// ============================================================================
// Helper Functions
// ============================================================================
function resolveTitle(title, template) {
    if (!title)
        return null;
    if (typeof title === 'string') {
        if (template) {
            return template.replace('%s', title);
        }
        return title;
    }
    // TemplateString object
    if (title.absolute) {
        return title.absolute;
    }
    const baseTitle = title.default ?? '';
    const activeTemplate = title.template || template;
    if (activeTemplate && baseTitle) {
        return activeTemplate.replace('%s', baseTitle);
    }
    return baseTitle;
}
function resolveUrl(url, base) {
    if (!url)
        return null;
    const urlStr = url.toString();
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        return urlStr;
    }
    if (base) {
        return new URL(urlStr, base.toString()).toString();
    }
    return urlStr;
}
// ============================================================================
// Meta Tag Generators
// ============================================================================
function generateBasicMeta(metadata) {
    const elements = [];
    // Description
    if (metadata.description) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "description", content: metadata.description }, "description"));
    }
    // Application name
    if (metadata.applicationName) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "application-name", content: metadata.applicationName }, "application-name"));
    }
    // Generator
    if (metadata.generator) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "generator", content: metadata.generator }, "generator"));
    }
    // Keywords
    if (metadata.keywords) {
        const keywords = Array.isArray(metadata.keywords)
            ? metadata.keywords.join(', ')
            : metadata.keywords;
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "keywords", content: keywords }, "keywords"));
    }
    // Referrer
    if (metadata.referrer) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "referrer", content: metadata.referrer }, "referrer"));
    }
    // Creator
    if (metadata.creator) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "creator", content: metadata.creator }, "creator"));
    }
    // Publisher
    if (metadata.publisher) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "publisher", content: metadata.publisher }, "publisher"));
    }
    // Category
    if (metadata.category) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "category", content: metadata.category }, "category"));
    }
    // Abstract
    if (metadata.abstract) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "abstract", content: metadata.abstract }, "abstract"));
    }
    return elements;
}
function generateAuthorMeta(authors) {
    if (!authors)
        return [];
    const authorList = Array.isArray(authors) ? authors : [authors];
    const elements = [];
    authorList.forEach((author, index) => {
        if (author.name) {
            elements.push((0, jsx_runtime_1.jsx)("meta", { name: "author", content: author.name }, `author-${index}`));
        }
        if (author.url) {
            elements.push((0, jsx_runtime_1.jsx)("link", { rel: "author", href: author.url.toString() }, `author-link-${index}`));
        }
    });
    return elements;
}
function robotsDirectives(robots) {
    const directives = [];
    if (robots.index !== undefined)
        directives.push(robots.index ? 'index' : 'noindex');
    if (robots.follow !== undefined)
        directives.push(robots.follow ? 'follow' : 'nofollow');
    if (robots.noarchive)
        directives.push('noarchive');
    if (robots.nosnippet)
        directives.push('nosnippet');
    if (robots.noimageindex)
        directives.push('noimageindex');
    if (robots.nocache)
        directives.push('nocache');
    if (robots.notranslate)
        directives.push('notranslate');
    if (robots['max-snippet'] !== undefined)
        directives.push(`max-snippet:${robots['max-snippet']}`);
    if (robots['max-image-preview'])
        directives.push(`max-image-preview:${robots['max-image-preview']}`);
    if (robots['max-video-preview'] !== undefined)
        directives.push(`max-video-preview:${robots['max-video-preview']}`);
    return directives;
}
function generateRobotsMeta(robots) {
    if (!robots)
        return [];
    if (typeof robots === 'string') {
        return [(0, jsx_runtime_1.jsx)("meta", { name: "robots", content: robots }, "robots")];
    }
    const elements = [];
    const directives = robotsDirectives(robots);
    if (directives.length > 0) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "robots", content: directives.join(', ') }, "robots"));
    }
    if (robots.googleBot) {
        if (typeof robots.googleBot === 'string') {
            elements.push((0, jsx_runtime_1.jsx)("meta", { name: "googlebot", content: robots.googleBot }, "googlebot"));
        }
        else {
            const googleDirectives = robotsDirectives(robots.googleBot);
            if (googleDirectives.length > 0) {
                elements.push((0, jsx_runtime_1.jsx)("meta", { name: "googlebot", content: googleDirectives.join(', ') }, "googlebot"));
            }
        }
    }
    return elements;
}
function generateOpenGraphMeta(og, base) {
    if (!og)
        return [];
    const elements = [];
    // Type
    if (og.type) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:type", content: og.type }, "og:type"));
    }
    else {
        elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:type", content: "website" }, "og:type"));
    }
    // Title
    if (og.title) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:title", content: og.title }, "og:title"));
    }
    // Description
    if (og.description) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:description", content: og.description }, "og:description"));
    }
    // URL
    if (og.url) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:url", content: resolveUrl(og.url, base) || '' }, "og:url"));
    }
    // Site name
    if (og.siteName) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:site_name", content: og.siteName }, "og:site_name"));
    }
    // Locale
    if (og.locale) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:locale", content: og.locale }, "og:locale"));
    }
    // Images
    if (og.images) {
        const images = Array.isArray(og.images) ? og.images : [og.images];
        images.forEach((image, index) => {
            if (typeof image === 'string' || image instanceof URL) {
                elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:image", content: resolveUrl(image, base) || '' }, `og:image:${index}`));
            }
            else {
                elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:image", content: resolveUrl(image.url, base) || '' }, `og:image:${index}`));
                if (image.width) {
                    elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:image:width", content: String(image.width) }, `og:image:width:${index}`));
                }
                if (image.height) {
                    elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:image:height", content: String(image.height) }, `og:image:height:${index}`));
                }
                if (image.alt) {
                    elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:image:alt", content: image.alt }, `og:image:alt:${index}`));
                }
                if (image.type) {
                    elements.push((0, jsx_runtime_1.jsx)("meta", { property: "og:image:type", content: image.type }, `og:image:type:${index}`));
                }
            }
        });
    }
    if ('article' in og && og.article) {
        const article = og.article;
        if (article.publishedTime) {
            elements.push((0, jsx_runtime_1.jsx)("meta", { property: "article:published_time", content: article.publishedTime }, "og:article:published_time"));
        }
        if (article.modifiedTime) {
            elements.push((0, jsx_runtime_1.jsx)("meta", { property: "article:modified_time", content: article.modifiedTime }, "og:article:modified_time"));
        }
        if (article.section) {
            elements.push((0, jsx_runtime_1.jsx)("meta", { property: "article:section", content: article.section }, "og:article:section"));
        }
        if (article.tags) {
            const tags = Array.isArray(article.tags) ? article.tags : [article.tags];
            tags.forEach((tag, index) => {
                elements.push((0, jsx_runtime_1.jsx)("meta", { property: "article:tag", content: tag }, `og:article:tag:${index}`));
            });
        }
    }
    return elements;
}
function generateTwitterMeta(twitter, base) {
    if (!twitter)
        return [];
    const elements = [];
    if (twitter.card) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "twitter:card", content: twitter.card }, "twitter:card"));
    }
    if (twitter.site) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "twitter:site", content: twitter.site }, "twitter:site"));
    }
    if (twitter.creator) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "twitter:creator", content: twitter.creator }, "twitter:creator"));
    }
    if (twitter.title) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "twitter:title", content: twitter.title }, "twitter:title"));
    }
    if (twitter.description) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "twitter:description", content: twitter.description }, "twitter:description"));
    }
    if (twitter.images) {
        const images = Array.isArray(twitter.images) ? twitter.images : [twitter.images];
        images.forEach((image, index) => {
            elements.push((0, jsx_runtime_1.jsx)("meta", { name: "twitter:image", content: resolveUrl(image, base) || image.toString() }, `twitter:image:${index}`));
        });
    }
    return elements;
}
function generateOtherMeta(other) {
    if (!other)
        return [];
    const elements = [];
    Object.entries(other).forEach(([name, value]) => {
        const values = Array.isArray(value) ? value : [value];
        values.forEach((entry, index) => {
            elements.push((0, jsx_runtime_1.jsx)("meta", { name: name, content: String(entry) }, `other-${name}-${index}`));
        });
    });
    return elements;
}
function generateAppleWebAppMeta(appleWebApp) {
    if (appleWebApp === null || appleWebApp === undefined)
        return [];
    const elements = [];
    if (appleWebApp === true) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "apple-mobile-web-app-capable", content: "yes" }, "apple-mobile-web-app-capable"));
        return elements;
    }
    if (appleWebApp === false)
        return elements;
    if (appleWebApp.capable !== undefined) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "apple-mobile-web-app-capable", content: appleWebApp.capable ? 'yes' : 'no' }, "apple-mobile-web-app-capable"));
    }
    if (appleWebApp.title) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "apple-mobile-web-app-title", content: appleWebApp.title }, "apple-mobile-web-app-title"));
    }
    if (appleWebApp.statusBarStyle) {
        elements.push((0, jsx_runtime_1.jsx)("meta", { name: "apple-mobile-web-app-status-bar-style", content: appleWebApp.statusBarStyle }, "apple-mobile-web-app-status-bar-style"));
    }
    return elements;
}
function generateFormatDetectionMeta(formatDetection) {
    if (!formatDetection)
        return [];
    const parts = [];
    ['telephone', 'date', 'address', 'email', 'url'].forEach((key) => {
        if (formatDetection[key] === false)
            parts.push(`${key}=no`);
        if (formatDetection[key] === true)
            parts.push(`${key}=yes`);
    });
    if (parts.length === 0)
        return [];
    return [
        (0, jsx_runtime_1.jsx)("meta", { name: "format-detection", content: parts.join(', ') }, "format-detection"),
    ];
}
function generateIconLinks(icons) {
    if (!icons)
        return [];
    const elements = [];
    const addIcon = (icon, rel = 'icon', index = 0) => {
        if (typeof icon === 'string' || icon instanceof URL) {
            elements.push((0, jsx_runtime_1.jsx)("link", { rel: rel, href: icon.toString() }, `${rel}-${index}`));
        }
        else {
            elements.push((0, jsx_runtime_1.jsx)("link", { rel: icon.rel || rel, href: icon.url.toString(), type: icon.type, sizes: icon.sizes }, `${rel}-${index}`));
        }
    };
    if (Array.isArray(icons)) {
        icons.forEach((icon, index) => addIcon(icon, 'icon', index));
    }
    else if (typeof icons === 'string' || icons instanceof URL) {
        addIcon(icons);
    }
    else if ('url' in icons) {
        // Single IconDescriptor
        addIcon(icons);
    }
    else {
        // Icons object
        const iconsObj = icons;
        if (iconsObj.icon) {
            const iconList = Array.isArray(iconsObj.icon) ? iconsObj.icon : [iconsObj.icon];
            iconList.forEach((icon, index) => addIcon(icon, 'icon', index));
        }
        if (iconsObj.shortcut) {
            const shortcutList = Array.isArray(iconsObj.shortcut)
                ? iconsObj.shortcut
                : [iconsObj.shortcut];
            shortcutList.forEach((icon, index) => addIcon(icon, 'shortcut icon', index));
        }
        if (iconsObj.apple) {
            const appleList = Array.isArray(iconsObj.apple) ? iconsObj.apple : [iconsObj.apple];
            appleList.forEach((icon, index) => addIcon(icon, 'apple-touch-icon', index));
        }
    }
    return elements;
}
function generateVerificationMeta(verification) {
    if (!verification)
        return [];
    const elements = [];
    if (verification.google) {
        const values = Array.isArray(verification.google) ? verification.google : [verification.google];
        values.forEach((value, index) => {
            elements.push((0, jsx_runtime_1.jsx)("meta", { name: "google-site-verification", content: value }, `google-site-verification-${index}`));
        });
    }
    if (verification.yandex) {
        const values = Array.isArray(verification.yandex) ? verification.yandex : [verification.yandex];
        values.forEach((value, index) => {
            elements.push((0, jsx_runtime_1.jsx)("meta", { name: "yandex-verification", content: value }, `yandex-verification-${index}`));
        });
    }
    if (verification.bing) {
        const values = Array.isArray(verification.bing) ? verification.bing : [verification.bing];
        values.forEach((value, index) => {
            elements.push((0, jsx_runtime_1.jsx)("meta", { name: "msvalidate.01", content: value }, `msvalidate.01-${index}`));
        });
    }
    return elements;
}
function generateAlternateLinks(alternates, base) {
    if (!alternates)
        return [];
    const elements = [];
    // Canonical
    if (alternates.canonical) {
        elements.push((0, jsx_runtime_1.jsx)("link", { rel: "canonical", href: resolveUrl(alternates.canonical, base) || '' }, "canonical"));
    }
    // Language alternates
    if (alternates.languages) {
        Object.entries(alternates.languages).forEach(([lang, url]) => {
            const urls = Array.isArray(url) ? url : [url];
            urls.forEach((u, index) => {
                elements.push((0, jsx_runtime_1.jsx)("link", { rel: "alternate", hrefLang: lang, href: resolveUrl(u, base) || '' }, `alternate-${lang}-${index}`));
            });
        });
    }
    if (alternates.media) {
        Object.entries(alternates.media).forEach(([media, url]) => {
            const urls = Array.isArray(url) ? url : [url];
            urls.forEach((u, index) => {
                elements.push((0, jsx_runtime_1.jsx)("link", { rel: "alternate", media: media, href: resolveUrl(u, base) || '' }, `alternate-media-${media}-${index}`));
            });
        });
    }
    if (alternates.types) {
        Object.entries(alternates.types).forEach(([type, url]) => {
            const urls = Array.isArray(url) ? url : [url];
            urls.forEach((u, index) => {
                elements.push((0, jsx_runtime_1.jsx)("link", { rel: "alternate", type: type, href: resolveUrl(u, base) || '' }, `alternate-type-${type}-${index}`));
            });
        });
    }
    return elements;
}
/**
 * Renders metadata as React head elements.
 * Returns an array of elements to be placed in <head>.
 */
function MetadataRenderer({ metadata, parentTemplate, }) {
    const base = metadata.metadataBase;
    const inheritedTemplate = parentTemplate ?? (0, merge_1.resolveParentTitleTemplate)(metadata);
    const title = resolveTitle(metadata.title, inheritedTemplate);
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [title && (0, jsx_runtime_1.jsx)("title", { children: title }), generateBasicMeta(metadata), generateAuthorMeta(metadata.authors), generateRobotsMeta(metadata.robots), generateOpenGraphMeta(metadata.openGraph, base), generateTwitterMeta(metadata.twitter, base), generateIconLinks(metadata.icons), generateVerificationMeta(metadata.verification), generateAlternateLinks(metadata.alternates, base), generateAppleWebAppMeta(metadata.appleWebApp), generateFormatDetectionMeta(metadata.formatDetection), generateOtherMeta(metadata.other), metadata.manifest && ((0, jsx_runtime_1.jsx)("link", { rel: "manifest", href: resolveUrl(metadata.manifest, base) || '' })), metadata.classification && ((0, jsx_runtime_1.jsx)("meta", { name: "classification", content: metadata.classification }))] }));
}
/**
 * Converts metadata to HTML string for SSR injection.
 * Applies title template from merged metadata when parentTemplate is omitted.
 */
function generateMetadataHtml(metadata, parentTemplate) {
    if (!metadata || typeof metadata !== 'object')
        return '';
    const { renderToStaticMarkup } = require('react-dom/server');
    const template = parentTemplate ?? (0, merge_1.resolveParentTitleTemplate)(metadata);
    return renderToStaticMarkup((0, jsx_runtime_1.jsx)(MetadataRenderer, { metadata: metadata, parentTemplate: template }));
}
exports.default = MetadataRenderer;
