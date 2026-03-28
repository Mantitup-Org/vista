"use strict";
/**
 * Vista Framework Constants
 *
 * All framework-specific naming lives here. When renaming the framework,
 * only this file (and the Rust equivalent naming.rs) needs to change.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOG_IGNORE_PREFIXES = exports.LOCAL_FONT_PREFIX = exports.MOUNT_ID_PREFIX = exports.THEME_SETTER = exports.WRAPPED_MARKER = exports.CLIENT_COMPONENTS_FLAG = exports.CLIENT_MANIFEST_FLAG = exports.SERVER_DEFINE = exports.BUILD_ID_DEFINE = exports.RSC_DATA_FLAG = exports.CLIENT_REFS_FLAG = exports.CONFIG_FLAG = exports.HYDRATE_DOCUMENT_FLAG = exports.STRUCTURE_ENDPOINT = exports.SSE_ENDPOINT = exports.IMAGE_ENDPOINT = exports.STATIC_CHUNKS_PATH = exports.URL_PREFIX = exports.FLASH_DIR = exports.BUILD_DIR = exports.FRAMEWORK_NAME = void 0;
// ============================================================================
// Framework Identity
// ============================================================================
/** Framework name used in logs, error messages, and branding */
exports.FRAMEWORK_NAME = 'vista';
// ============================================================================
// Build Directory (.vista/ — equivalent to Next.js .next/)
// ============================================================================
/** Hidden build output directory name */
exports.BUILD_DIR = '.vista';
/** Flashpack workspace/runtime directory name */
exports.FLASH_DIR = '.flash';
// ============================================================================
// URL Prefixes (/_vista/ — equivalent to Next.js /_next/)
// ============================================================================
/** Base URL prefix for all framework-served assets */
exports.URL_PREFIX = '/_vista';
/** Static chunks URL path */
exports.STATIC_CHUNKS_PATH = '/_vista/static/chunks/';
/** Image optimization endpoint URL */
exports.IMAGE_ENDPOINT = '/_vista/image';
/** SSE live-reload endpoint */
exports.SSE_ENDPOINT = '/__vista_reload';
/** Structure validation endpoint (dev only) */
exports.STRUCTURE_ENDPOINT = '/__vista_structure';
// ============================================================================
// Window Globals (__VISTA_* — equivalent to Next.js __NEXT_*)
// ============================================================================
/** Hydration mode flag: true = full document, false = content only */
exports.HYDRATE_DOCUMENT_FLAG = '__VISTA_HYDRATE_DOCUMENT__';
/** Client config injection */
exports.CONFIG_FLAG = '__VISTA_CONFIG__';
/** Client component references array */
exports.CLIENT_REFS_FLAG = '__VISTA_CLIENT_REFERENCES__';
/** RSC payload data */
exports.RSC_DATA_FLAG = '__VISTA_RSC_DATA__';
/** Build ID injection (webpack DefinePlugin) */
exports.BUILD_ID_DEFINE = '__VISTA_BUILD_ID__';
/** Server-side flag (webpack DefinePlugin) */
exports.SERVER_DEFINE = '__VISTA_SERVER__';
/** Client manifest injection */
exports.CLIENT_MANIFEST_FLAG = '__VISTA_CLIENT_MANIFEST__';
/** Client components list */
exports.CLIENT_COMPONENTS_FLAG = '__VISTA_CLIENT_COMPONENTS__';
// ============================================================================
// Internal Markers
// ============================================================================
/** Component wrapper marker to prevent double-wrapping */
exports.WRAPPED_MARKER = '__vistaWrapped';
/** Theme setter function name */
exports.THEME_SETTER = '__vistaSetTheme';
/** Client component mount ID prefix (used in Rust serializer too) */
exports.MOUNT_ID_PREFIX = '__vista_cc_';
/** Local font family name prefix */
exports.LOCAL_FONT_PREFIX = '__vista_local_';
// ============================================================================
// Logger Ignore Prefixes
// ============================================================================
/** URL prefixes to suppress in request logging */
exports.LOG_IGNORE_PREFIXES = ['/__vista', '/_vista/static/'];
