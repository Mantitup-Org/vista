/**
 * Vista Framework Constants
 *
 * All framework-specific naming lives here. When renaming the framework,
 * only this file (and the Rust equivalent naming.rs) needs to change.
 */

// ============================================================================
// Framework Identity
// ============================================================================

/** Framework name used in logs, error messages, and branding */
export const FRAMEWORK_NAME = 'vista';

// ============================================================================
// Build Directory (.vista/ — equivalent to Next.js .next/)
// ============================================================================

/** Hidden build output directory name */
export const BUILD_DIR = '.vista';

/** Flashpack workspace/runtime directory name */
export const FLASH_DIR = '.flash';

// ============================================================================
// URL Prefixes (/_vista/ — equivalent to Next.js /_next/)
// ============================================================================

/** Base URL prefix for all framework-served assets */
export const URL_PREFIX = '/_vista';

/** Static chunks URL path */
export const STATIC_CHUNKS_PATH = '/_vista/static/chunks/';

/** Image optimization endpoint URL */
export const IMAGE_ENDPOINT = '/_vista/image';

/** SSE live-reload endpoint */
export const SSE_ENDPOINT = '/__vista_reload';

/** Structure validation endpoint (dev only) */
export const STRUCTURE_ENDPOINT = '/__vista_structure';

// ============================================================================
// Window Globals (__VISTA_* — equivalent to Next.js __NEXT_*)
// ============================================================================

/** Hydration mode flag: true = full document, false = content only */
export const HYDRATE_DOCUMENT_FLAG = '__VISTA_HYDRATE_DOCUMENT__';

/** Client config injection */
export const CONFIG_FLAG = '__VISTA_CONFIG__';

/** Client component references array */
export const CLIENT_REFS_FLAG = '__VISTA_CLIENT_REFERENCES__';

/** RSC payload data */
export const RSC_DATA_FLAG = '__VISTA_RSC_DATA__';

/** Build ID injection (webpack DefinePlugin) */
export const BUILD_ID_DEFINE = '__VISTA_BUILD_ID__';

/** Server-side flag (webpack DefinePlugin) */
export const SERVER_DEFINE = '__VISTA_SERVER__';

/** Client manifest injection */
export const CLIENT_MANIFEST_FLAG = '__VISTA_CLIENT_MANIFEST__';

/** Client components list */
export const CLIENT_COMPONENTS_FLAG = '__VISTA_CLIENT_COMPONENTS__';

// ============================================================================
// Internal Markers
// ============================================================================

/** Component wrapper marker to prevent double-wrapping */
export const WRAPPED_MARKER = '__vistaWrapped';

/** Theme setter function name */
export const THEME_SETTER = '__vistaSetTheme';

/** Client component mount ID prefix (used in Rust serializer too) */
export const MOUNT_ID_PREFIX = '__vista_cc_';

/** Local font family name prefix */
export const LOCAL_FONT_PREFIX = '__vista_local_';

// ============================================================================
// Logger Ignore Prefixes
// ============================================================================

/** URL prefixes to suppress in request logging */
export const LOG_IGNORE_PREFIXES = ['/__vista', '/_vista/static/'];
