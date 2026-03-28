/**
 * Vista Framework Constants
 *
 * All framework-specific naming lives here. When renaming the framework,
 * only this file (and the Rust equivalent naming.rs) needs to change.
 */
/** Framework name used in logs, error messages, and branding */
export declare const FRAMEWORK_NAME = "vista";
/** Hidden build output directory name */
export declare const BUILD_DIR = ".vista";
/** Flashpack workspace/runtime directory name */
export declare const FLASH_DIR = ".flash";
/** Base URL prefix for all framework-served assets */
export declare const URL_PREFIX = "/_vista";
/** Static chunks URL path */
export declare const STATIC_CHUNKS_PATH = "/_vista/static/chunks/";
/** Image optimization endpoint URL */
export declare const IMAGE_ENDPOINT = "/_vista/image";
/** SSE live-reload endpoint */
export declare const SSE_ENDPOINT = "/__vista_reload";
/** Structure validation endpoint (dev only) */
export declare const STRUCTURE_ENDPOINT = "/__vista_structure";
/** Hydration mode flag: true = full document, false = content only */
export declare const HYDRATE_DOCUMENT_FLAG = "__VISTA_HYDRATE_DOCUMENT__";
/** Client config injection */
export declare const CONFIG_FLAG = "__VISTA_CONFIG__";
/** Client component references array */
export declare const CLIENT_REFS_FLAG = "__VISTA_CLIENT_REFERENCES__";
/** RSC payload data */
export declare const RSC_DATA_FLAG = "__VISTA_RSC_DATA__";
/** Build ID injection (webpack DefinePlugin) */
export declare const BUILD_ID_DEFINE = "__VISTA_BUILD_ID__";
/** Server-side flag (webpack DefinePlugin) */
export declare const SERVER_DEFINE = "__VISTA_SERVER__";
/** Client manifest injection */
export declare const CLIENT_MANIFEST_FLAG = "__VISTA_CLIENT_MANIFEST__";
/** Client components list */
export declare const CLIENT_COMPONENTS_FLAG = "__VISTA_CLIENT_COMPONENTS__";
/** Component wrapper marker to prevent double-wrapping */
export declare const WRAPPED_MARKER = "__vistaWrapped";
/** Theme setter function name */
export declare const THEME_SETTER = "__vistaSetTheme";
/** Client component mount ID prefix (used in Rust serializer too) */
export declare const MOUNT_ID_PREFIX = "__vista_cc_";
/** Local font family name prefix */
export declare const LOCAL_FONT_PREFIX = "__vista_local_";
/** URL prefixes to suppress in request logging */
export declare const LOG_IGNORE_PREFIXES: string[];
