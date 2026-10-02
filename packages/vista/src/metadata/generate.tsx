/**
 * Vista Metadata Renderer
 *
 * Converts Metadata object to React head elements.
 * Used by server for SSR and can be used client-side.
 */

import * as React from 'react';
import type {
  Metadata,
  TemplateString,
  OpenGraph,
  Twitter,
  Icons,
  Icon,
  IconDescriptor,
  Robots,
  Author,
  AlternateURLs,
  Verification,
  AppleWebApp,
  FormatDetection,
} from './types';
import { resolveParentTitleTemplate } from './merge';

// ============================================================================
// Helper Functions
// ============================================================================

function resolveTitle(
  title: string | TemplateString | null | undefined,
  template?: string
): string | null {
  if (!title) return null;

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

function resolveUrl(
  url: string | URL | null | undefined,
  base?: string | URL | null
): string | null {
  if (!url) return null;
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

function generateBasicMeta(metadata: Metadata): React.ReactElement[] {
  const elements: React.ReactElement[] = [];

  // Description
  if (metadata.description) {
    elements.push(<meta key="description" name="description" content={metadata.description} />);
  }

  // Application name
  if (metadata.applicationName) {
    elements.push(
      <meta key="application-name" name="application-name" content={metadata.applicationName} />
    );
  }

  // Generator
  if (metadata.generator) {
    elements.push(<meta key="generator" name="generator" content={metadata.generator} />);
  }

  // Keywords
  if (metadata.keywords) {
    const keywords = Array.isArray(metadata.keywords)
      ? metadata.keywords.join(', ')
      : metadata.keywords;
    elements.push(<meta key="keywords" name="keywords" content={keywords} />);
  }

  // Referrer
  if (metadata.referrer) {
    elements.push(<meta key="referrer" name="referrer" content={metadata.referrer} />);
  }

  // Creator
  if (metadata.creator) {
    elements.push(<meta key="creator" name="creator" content={metadata.creator} />);
  }

  // Publisher
  if (metadata.publisher) {
    elements.push(<meta key="publisher" name="publisher" content={metadata.publisher} />);
  }

  // Category
  if (metadata.category) {
    elements.push(<meta key="category" name="category" content={metadata.category} />);
  }

  // Abstract
  if (metadata.abstract) {
    elements.push(<meta key="abstract" name="abstract" content={metadata.abstract} />);
  }

  return elements;
}

function generateAuthorMeta(authors: Author | Author[] | null | undefined): React.ReactElement[] {
  if (!authors) return [];

  const authorList = Array.isArray(authors) ? authors : [authors];
  const elements: React.ReactElement[] = [];

  authorList.forEach((author, index) => {
    if (author.name) {
      elements.push(<meta key={`author-${index}`} name="author" content={author.name} />);
    }
    if (author.url) {
      elements.push(
        <link key={`author-link-${index}`} rel="author" href={author.url.toString()} />
      );
    }
  });

  return elements;
}

function robotsDirectives(robots: Robots): string[] {
  const directives: string[] = [];
  if (robots.index !== undefined) directives.push(robots.index ? 'index' : 'noindex');
  if (robots.follow !== undefined) directives.push(robots.follow ? 'follow' : 'nofollow');
  if (robots.noarchive) directives.push('noarchive');
  if (robots.nosnippet) directives.push('nosnippet');
  if (robots.noimageindex) directives.push('noimageindex');
  if (robots.nocache) directives.push('nocache');
  if (robots.notranslate) directives.push('notranslate');
  if (robots['max-snippet'] !== undefined) directives.push(`max-snippet:${robots['max-snippet']}`);
  if (robots['max-image-preview'])
    directives.push(`max-image-preview:${robots['max-image-preview']}`);
  if (robots['max-video-preview'] !== undefined)
    directives.push(`max-video-preview:${robots['max-video-preview']}`);
  return directives;
}

function generateRobotsMeta(robots: string | Robots | null | undefined): React.ReactElement[] {
  if (!robots) return [];

  if (typeof robots === 'string') {
    return [<meta key="robots" name="robots" content={robots} />];
  }

  const elements: React.ReactElement[] = [];
  const directives = robotsDirectives(robots);

  if (directives.length > 0) {
    elements.push(<meta key="robots" name="robots" content={directives.join(', ')} />);
  }

  if (robots.googleBot) {
    if (typeof robots.googleBot === 'string') {
      elements.push(<meta key="googlebot" name="googlebot" content={robots.googleBot} />);
    } else {
      const googleDirectives = robotsDirectives(robots.googleBot);
      if (googleDirectives.length > 0) {
        elements.push(
          <meta key="googlebot" name="googlebot" content={googleDirectives.join(', ')} />
        );
      }
    }
  }

  return elements;
}

function generateOpenGraphMeta(
  og: OpenGraph | null | undefined,
  base?: string | URL | null
): React.ReactElement[] {
  if (!og) return [];

  const elements: React.ReactElement[] = [];

  // Type
  if (og.type) {
    elements.push(<meta key="og:type" property="og:type" content={og.type} />);
  } else {
    elements.push(<meta key="og:type" property="og:type" content="website" />);
  }

  // Title
  if (og.title) {
    elements.push(<meta key="og:title" property="og:title" content={og.title} />);
  }

  // Description
  if (og.description) {
    elements.push(<meta key="og:description" property="og:description" content={og.description} />);
  }

  // URL
  if (og.url) {
    elements.push(<meta key="og:url" property="og:url" content={resolveUrl(og.url, base) || ''} />);
  }

  // Site name
  if (og.siteName) {
    elements.push(<meta key="og:site_name" property="og:site_name" content={og.siteName} />);
  }

  // Locale
  if (og.locale) {
    elements.push(<meta key="og:locale" property="og:locale" content={og.locale} />);
  }

  // Images
  if (og.images) {
    const images = Array.isArray(og.images) ? og.images : [og.images];
    images.forEach((image, index) => {
      if (typeof image === 'string' || image instanceof URL) {
        elements.push(
          <meta
            key={`og:image:${index}`}
            property="og:image"
            content={resolveUrl(image, base) || ''}
          />
        );
      } else {
        elements.push(
          <meta
            key={`og:image:${index}`}
            property="og:image"
            content={resolveUrl(image.url, base) || ''}
          />
        );
        if (image.width) {
          elements.push(
            <meta
              key={`og:image:width:${index}`}
              property="og:image:width"
              content={String(image.width)}
            />
          );
        }
        if (image.height) {
          elements.push(
            <meta
              key={`og:image:height:${index}`}
              property="og:image:height"
              content={String(image.height)}
            />
          );
        }
        if (image.alt) {
          elements.push(
            <meta key={`og:image:alt:${index}`} property="og:image:alt" content={image.alt} />
          );
        }
        if (image.type) {
          elements.push(
            <meta key={`og:image:type:${index}`} property="og:image:type" content={image.type} />
          );
        }
      }
    });
  }

  if ('article' in og && og.article) {
    const article = og.article;
    if (article.publishedTime) {
      elements.push(
        <meta
          key="og:article:published_time"
          property="article:published_time"
          content={article.publishedTime}
        />
      );
    }
    if (article.modifiedTime) {
      elements.push(
        <meta
          key="og:article:modified_time"
          property="article:modified_time"
          content={article.modifiedTime}
        />
      );
    }
    if (article.section) {
      elements.push(
        <meta key="og:article:section" property="article:section" content={article.section} />
      );
    }
    if (article.tags) {
      const tags = Array.isArray(article.tags) ? article.tags : [article.tags];
      tags.forEach((tag, index) => {
        elements.push(
          <meta key={`og:article:tag:${index}`} property="article:tag" content={tag} />
        );
      });
    }
  }

  return elements;
}

function generateTwitterMeta(
  twitter: Twitter | null | undefined,
  base?: string | URL | null
): React.ReactElement[] {
  if (!twitter) return [];

  const elements: React.ReactElement[] = [];

  if (twitter.card) {
    elements.push(<meta key="twitter:card" name="twitter:card" content={twitter.card} />);
  }

  if (twitter.site) {
    elements.push(<meta key="twitter:site" name="twitter:site" content={twitter.site} />);
  }

  if (twitter.creator) {
    elements.push(<meta key="twitter:creator" name="twitter:creator" content={twitter.creator} />);
  }

  if (twitter.title) {
    elements.push(<meta key="twitter:title" name="twitter:title" content={twitter.title} />);
  }

  if (twitter.description) {
    elements.push(
      <meta key="twitter:description" name="twitter:description" content={twitter.description} />
    );
  }

  if (twitter.images) {
    const images = Array.isArray(twitter.images) ? twitter.images : [twitter.images];
    images.forEach((image, index) => {
      elements.push(
        <meta
          key={`twitter:image:${index}`}
          name="twitter:image"
          content={resolveUrl(image, base) || image.toString()}
        />
      );
    });
  }

  return elements;
}

function generateOtherMeta(
  other: Record<string, string | number | Array<string | number>> | null | undefined
): React.ReactElement[] {
  if (!other) return [];
  const elements: React.ReactElement[] = [];
  Object.entries(other).forEach(([name, value]) => {
    const values = Array.isArray(value) ? value : [value];
    values.forEach((entry, index) => {
      elements.push(
        <meta key={`other-${name}-${index}`} name={name} content={String(entry)} />
      );
    });
  });
  return elements;
}

function generateAppleWebAppMeta(
  appleWebApp: boolean | AppleWebApp | null | undefined
): React.ReactElement[] {
  if (appleWebApp === null || appleWebApp === undefined) return [];
  const elements: React.ReactElement[] = [];

  if (appleWebApp === true) {
    elements.push(
      <meta key="apple-mobile-web-app-capable" name="apple-mobile-web-app-capable" content="yes" />
    );
    return elements;
  }
  if (appleWebApp === false) return elements;

  if (appleWebApp.capable !== undefined) {
    elements.push(
      <meta
        key="apple-mobile-web-app-capable"
        name="apple-mobile-web-app-capable"
        content={appleWebApp.capable ? 'yes' : 'no'}
      />
    );
  }
  if (appleWebApp.title) {
    elements.push(
      <meta
        key="apple-mobile-web-app-title"
        name="apple-mobile-web-app-title"
        content={appleWebApp.title}
      />
    );
  }
  if (appleWebApp.statusBarStyle) {
    elements.push(
      <meta
        key="apple-mobile-web-app-status-bar-style"
        name="apple-mobile-web-app-status-bar-style"
        content={appleWebApp.statusBarStyle}
      />
    );
  }
  return elements;
}

function generateFormatDetectionMeta(
  formatDetection: FormatDetection | null | undefined
): React.ReactElement[] {
  if (!formatDetection) return [];
  const parts: string[] = [];
  (['telephone', 'date', 'address', 'email', 'url'] as const).forEach((key) => {
    if (formatDetection[key] === false) parts.push(`${key}=no`);
    if (formatDetection[key] === true) parts.push(`${key}=yes`);
  });
  if (parts.length === 0) return [];
  return [
    <meta key="format-detection" name="format-detection" content={parts.join(', ')} />,
  ];
}

function generateIconLinks(
  icons: IconDescriptor | Icon | Icons | Array<Icon> | null | undefined
): React.ReactElement[] {
  if (!icons) return [];

  const elements: React.ReactElement[] = [];

  const addIcon = (icon: Icon, rel: string = 'icon', index: number = 0) => {
    if (typeof icon === 'string' || icon instanceof URL) {
      elements.push(<link key={`${rel}-${index}`} rel={rel} href={icon.toString()} />);
    } else {
      elements.push(
        <link
          key={`${rel}-${index}`}
          rel={icon.rel || rel}
          href={icon.url.toString()}
          type={icon.type}
          sizes={icon.sizes}
        />
      );
    }
  };

  if (Array.isArray(icons)) {
    icons.forEach((icon, index) => addIcon(icon, 'icon', index));
  } else if (typeof icons === 'string' || icons instanceof URL) {
    addIcon(icons as Icon);
  } else if ('url' in icons) {
    // Single IconDescriptor
    addIcon(icons as IconDescriptor);
  } else {
    // Icons object
    const iconsObj = icons as Icons;
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

function generateVerificationMeta(
  verification: Verification | null | undefined
): React.ReactElement[] {
  if (!verification) return [];

  const elements: React.ReactElement[] = [];

  if (verification.google) {
    const values = Array.isArray(verification.google) ? verification.google : [verification.google];
    values.forEach((value, index) => {
      elements.push(
        <meta
          key={`google-site-verification-${index}`}
          name="google-site-verification"
          content={value}
        />
      );
    });
  }

  if (verification.yandex) {
    const values = Array.isArray(verification.yandex) ? verification.yandex : [verification.yandex];
    values.forEach((value, index) => {
      elements.push(
        <meta key={`yandex-verification-${index}`} name="yandex-verification" content={value} />
      );
    });
  }

  if (verification.bing) {
    const values = Array.isArray(verification.bing) ? verification.bing : [verification.bing];
    values.forEach((value, index) => {
      elements.push(<meta key={`msvalidate.01-${index}`} name="msvalidate.01" content={value} />);
    });
  }

  return elements;
}

function generateAlternateLinks(
  alternates: AlternateURLs | null | undefined,
  base?: string | URL | null
): React.ReactElement[] {
  if (!alternates) return [];

  const elements: React.ReactElement[] = [];

  // Canonical
  if (alternates.canonical) {
    elements.push(
      <link key="canonical" rel="canonical" href={resolveUrl(alternates.canonical, base) || ''} />
    );
  }

  // Language alternates
  if (alternates.languages) {
    Object.entries(alternates.languages).forEach(([lang, url]) => {
      const urls = Array.isArray(url) ? url : [url];
      urls.forEach((u, index) => {
        elements.push(
          <link
            key={`alternate-${lang}-${index}`}
            rel="alternate"
            hrefLang={lang}
            href={resolveUrl(u, base) || ''}
          />
        );
      });
    });
  }

  if (alternates.media) {
    Object.entries(alternates.media).forEach(([media, url]) => {
      const urls = Array.isArray(url) ? url : [url];
      urls.forEach((u, index) => {
        elements.push(
          <link
            key={`alternate-media-${media}-${index}`}
            rel="alternate"
            media={media}
            href={resolveUrl(u, base) || ''}
          />
        );
      });
    });
  }

  if (alternates.types) {
    Object.entries(alternates.types).forEach(([type, url]) => {
      const urls = Array.isArray(url) ? url : [url];
      urls.forEach((u, index) => {
        elements.push(
          <link
            key={`alternate-type-${type}-${index}`}
            rel="alternate"
            type={type}
            href={resolveUrl(u, base) || ''}
          />
        );
      });
    });
  }

  return elements;
}

// ============================================================================
// Main Renderer Component
// ============================================================================

export interface MetadataRendererProps {
  metadata: Metadata;
  parentTemplate?: string;
}

/**
 * Renders metadata as React head elements.
 * Returns an array of elements to be placed in <head>.
 */
export function MetadataRenderer({
  metadata,
  parentTemplate,
}: MetadataRendererProps): React.ReactElement {
  const base = metadata.metadataBase;
  const inheritedTemplate = parentTemplate ?? resolveParentTitleTemplate(metadata);
  const title = resolveTitle(metadata.title, inheritedTemplate);

  return (
    <>
      {title && <title>{title}</title>}
      {generateBasicMeta(metadata)}
      {generateAuthorMeta(metadata.authors)}
      {generateRobotsMeta(metadata.robots)}
      {generateOpenGraphMeta(metadata.openGraph, base)}
      {generateTwitterMeta(metadata.twitter, base)}
      {generateIconLinks(metadata.icons)}
      {generateVerificationMeta(metadata.verification)}
      {generateAlternateLinks(metadata.alternates, base)}
      {generateAppleWebAppMeta(metadata.appleWebApp)}
      {generateFormatDetectionMeta(metadata.formatDetection)}
      {generateOtherMeta(metadata.other)}
      {metadata.manifest && (
        <link rel="manifest" href={resolveUrl(metadata.manifest, base) || ''} />
      )}
      {metadata.classification && (
        <meta name="classification" content={metadata.classification} />
      )}
    </>
  );
}

/**
 * Converts metadata to HTML string for SSR injection.
 * Applies title template from merged metadata when parentTemplate is omitted.
 */
export function generateMetadataHtml(metadata: Metadata, parentTemplate?: string): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const { renderToStaticMarkup } = require('react-dom/server');
  const template = parentTemplate ?? resolveParentTitleTemplate(metadata);
  return renderToStaticMarkup(
    <MetadataRenderer metadata={metadata} parentTemplate={template} />
  );
}

export default MetadataRenderer;
