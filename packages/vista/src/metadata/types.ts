/**
 * Vista Metadata Types
 * 
 * Complete TypeScript types for Next.js-compatible metadata API.
 * Supports static `metadata` exports and dynamic `generateMetadata` function.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Template string for title with inheritance support
 */
export type TemplateString = {
    default?: string;
    template?: string;
    absolute?: string;
};

/**
 * Author metadata
 */
export interface Author {
    name?: string;
    url?: string | URL;
}

/**
 * Robots directive
 */
export interface Robots {
    index?: boolean;
    follow?: boolean;
    noarchive?: boolean;
    nosnippet?: boolean;
    noimageindex?: boolean;
    nocache?: boolean;
    notranslate?: boolean;
    'max-snippet'?: number;
    'max-image-preview'?: 'none' | 'standard' | 'large';
    'max-video-preview'?: number;
    googleBot?: string | Robots;
}

// ============================================================================
// Icons
// ============================================================================

export type IconURL = string | URL;

export interface IconDescriptor {
    url: string | URL;
    type?: string;
    sizes?: string;
    color?: string;
    rel?: string;
    media?: string;
    fetchPriority?: 'high' | 'low' | 'auto';
}

export type Icon = IconURL | IconDescriptor;

export interface Icons {
    icon?: Icon | Icon[];
    shortcut?: Icon | Icon[];
    apple?: Icon | Icon[];
    other?: IconDescriptor | IconDescriptor[];
}

// ============================================================================
// Open Graph
// ============================================================================

export interface OpenGraphImage {
    url: string | URL;
    secureUrl?: string | URL;
    alt?: string;
    type?: string;
    width?: string | number;
    height?: string | number;
}

export interface OpenGraphVideo {
    url: string | URL;
    secureUrl?: string | URL;
    type?: string;
    width?: string | number;
    height?: string | number;
}

export interface OpenGraphAudio {
    url: string | URL;
    secureUrl?: string | URL;
    type?: string;
}

export interface OpenGraphArticle {
    publishedTime?: string;
    modifiedTime?: string;
    expirationTime?: string;
    authors?: null | string | URL | Array<string | URL>;
    section?: null | string;
    tags?: null | string | Array<string>;
}

export interface OpenGraphProfile {
    firstName?: string;
    lastName?: string;
    username?: string;
    gender?: string;
}

export interface OpenGraphBook {
    isbn?: string;
    releaseDate?: string;
    authors?: string | URL | Array<string | URL>;
    tags?: string | Array<string>;
}

export interface OpenGraphBase {
    title?: string;
    description?: string;
    url?: string | URL;
    siteName?: string;
    locale?: string;
    images?: string | URL | OpenGraphImage | Array<string | URL | OpenGraphImage>;
    videos?: string | URL | OpenGraphVideo | Array<string | URL | OpenGraphVideo>;
    audio?: string | URL | OpenGraphAudio | Array<string | URL | OpenGraphAudio>;
    countryName?: string;
    ttl?: number;
    determiner?: 'a' | 'an' | 'the' | 'auto' | '';
    emails?: string | Array<string>;
    phoneNumbers?: string | Array<string>;
    faxNumbers?: string | Array<string>;
}

export interface OpenGraphWebsite extends OpenGraphBase {
    type?: 'website';
}

export interface OpenGraphArticleType extends OpenGraphBase {
    type: 'article';
    article?: OpenGraphArticle;
}

export interface OpenGraphProfileType extends OpenGraphBase {
    type: 'profile';
    profile?: OpenGraphProfile;
}

export interface OpenGraphBookType extends OpenGraphBase {
    type: 'book';
    book?: OpenGraphBook;
}

export type OpenGraph = 
    | OpenGraphWebsite 
    | OpenGraphArticleType 
    | OpenGraphProfileType 
    | OpenGraphBookType;

// ============================================================================
// Twitter
// ============================================================================

export interface TwitterPlayerDescriptor {
    playerUrl: string | URL;
    streamUrl: string | URL;
    width: number;
    height: number;
}

export interface TwitterAppDescriptor {
    id: {
        iphone?: string | number;
        ipad?: string | number;
        googleplay?: string;
    };
    url?: {
        iphone?: string | URL;
        ipad?: string | URL;
        googleplay?: string | URL;
    };
    name?: string;
}

export interface TwitterSummary {
    card: 'summary' | 'summary_large_image';
    site?: string;
    siteId?: string;
    creator?: string;
    creatorId?: string;
    title?: string;
    description?: string;
    images?: string | Array<string>;
}

export interface TwitterPlayer {
    card: 'player';
    site?: string;
    siteId?: string;
    creator?: string;
    creatorId?: string;
    title?: string;
    description?: string;
    images?: string | Array<string>;
    players: TwitterPlayerDescriptor | Array<TwitterPlayerDescriptor>;
}

export interface TwitterApp {
    card: 'app';
    site?: string;
    siteId?: string;
    creator?: string;
    creatorId?: string;
    title?: string;
    description?: string;
    images?: string | Array<string>;
    app: TwitterAppDescriptor;
}

export type Twitter = TwitterSummary | TwitterPlayer | TwitterApp;

// ============================================================================
// Verification
// ============================================================================

export interface Verification {
    google?: string | Array<string>;
    yahoo?: string | Array<string>;
    yandex?: string | Array<string>;
    me?: string | Array<string>;
    bing?: string | Array<string>;
    other?: Record<string, string | Array<string>>;
}

// ============================================================================
// Alternates
// ============================================================================

export interface AlternateURLs {
    canonical?: string | URL;
    languages?: Record<string, string | URL | Array<string | URL>>;
    media?: Record<string, string | URL | Array<string | URL>>;
    types?: Record<string, string | URL | Array<string | URL>>;
}

// ============================================================================
// Apple Web App
// ============================================================================

export interface AppleWebApp {
    capable?: boolean;
    title?: string;
    startupImage?: string | AppleStartupImage | Array<AppleStartupImage>;
    statusBarStyle?: 'default' | 'black' | 'black-translucent';
}

export interface AppleStartupImage {
    url: string;
    media?: string;
}

// ============================================================================
// Format Detection
// ============================================================================

export interface FormatDetection {
    telephone?: boolean;
    date?: boolean;
    address?: boolean;
    email?: boolean;
    url?: boolean;
}

// ============================================================================
// Main Metadata Interface
// ============================================================================

/**
 * Metadata object for Vista pages and layouts.
 * Compatible with Next.js App Router metadata API.
 */
export interface Metadata {
    /**
     * The base URL for resolving relative URLs in metadata.
     */
    metadataBase?: null | string | URL;

    /**
     * The document title.
     * Can be a string or a template object with default/template/absolute.
     */
    title?: null | string | TemplateString;

    /**
     * The document description.
     */
    description?: null | string;

    /**
     * Application name.
     */
    applicationName?: null | string;

    /**
     * Document authors.
     */
    authors?: null | Author | Array<Author>;

    /**
     * Generator (framework name).
     */
    generator?: null | string;

    /**
     * Keywords for the document.
     */
    keywords?: null | string | Array<string>;

    /**
     * Referrer policy.
     */
    referrer?: null
        | 'no-referrer'
        | 'no-referrer-when-downgrade'
        | 'origin'
        | 'origin-when-cross-origin'
        | 'same-origin'
        | 'strict-origin'
        | 'strict-origin-when-cross-origin'
        | 'unsafe-url';

    /**
     * Creator of the document.
     */
    creator?: null | string;

    /**
     * Publisher of the document.
     */
    publisher?: null | string;

    /**
     * Robots directives.
     */
    robots?: null | string | Robots;

    /**
     * Alternate URLs (canonical, language variants).
     */
    alternates?: null | AlternateURLs;

    /**
     * Icons (favicon, apple-touch-icon, etc.).
     */
    icons?: null | IconURL | Array<Icon> | Icons;

    /**
     * Web app manifest URL.
     */
    manifest?: null | string | URL;

    /**
     * Open Graph metadata.
     */
    openGraph?: null | OpenGraph;

    /**
     * Twitter Card metadata.
     */
    twitter?: null | Twitter;

    /**
     * Verification tokens for search engines.
     */
    verification?: null | Verification;

    /**
     * Apple web app configuration.
     */
    appleWebApp?: null | boolean | AppleWebApp;

    /**
     * Format detection hints.
     */
    formatDetection?: null | FormatDetection;

    /**
     * Abstract (brief description, deprecated).
     */
    abstract?: null | string;

    /**
     * Category of the page.
     */
    category?: null | string;

    /**
     * Classification of the page.
     */
    classification?: null | string;

    /**
     * Other custom metadata.
     */
    other?: Record<string, string | number | Array<string | number>>;
}

// ============================================================================
// Dynamic Metadata
// ============================================================================

/**
 * Props passed to generateMetadata function.
 */
export interface MetadataProps<Params = Record<string, string>> {
    params: Params;
    searchParams?: Record<string, string | string[]>;
}

/**
 * Parent metadata from parent layout.
 */
export interface ResolvingMetadata extends Metadata {
    // Future: resolved URLs, merged values, etc.
}

/**
 * Type for generateMetadata function.
 */
export type GenerateMetadata<Params = Record<string, string>> = (
    props: MetadataProps<Params>,
    parent: ResolvingMetadata
) => Metadata | Promise<Metadata>;

// ============================================================================
// Export type guard
// ============================================================================

export function isTemplateString(title: unknown): title is TemplateString {
    if (typeof title !== 'object' || title === null) return false;
    return 'default' in title || 'absolute' in title || 'template' in title;
}
