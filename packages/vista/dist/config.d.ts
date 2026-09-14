import { ImageConfig } from './image/image-config';
export type ValidationMode = 'strict' | 'warn';
export type ValidationLogLevel = 'compact' | 'verbose';
export type TypedApiSerialization = 'json' | 'superjson';
export type VistaEngineVariant = 'default' | 'flashpack';
export type VistaEngineAlias = 'webpack';
export interface VistaEngineConfig {
    /**
     * Engine variant for runtime/build.
     * - default => webpack path
     * - flashpack => Rust-first path
     * Compatibility alias accepted: webpack.
     */
    variant?: VistaEngineVariant | VistaEngineAlias;
}
export interface StructureValidationConfig {
    /** Enable structure validation. Default: true */
    enabled?: boolean;
    /** Validation mode. 'strict' blocks dev/fails build on errors. 'warn' only logs. Default: 'strict' */
    mode?: ValidationMode;
    /** Show warnings in the dev overlay. Default: false */
    includeWarningsInOverlay?: boolean;
    /** Log output format. Default: 'compact' */
    logLevel?: ValidationLogLevel;
    /** Debounce interval for watch events in ms. Default: 120 */
    watchDebounceMs?: number;
}
export interface TypedApiExperimentalConfig {
    /** Enable typed API runtime. Default: false */
    enabled?: boolean;
    /** Request/response serialization mode. Default: 'json' */
    serialization?: TypedApiSerialization;
    /** Maximum request body size for typed API endpoints in bytes. Default: 1MB */
    bodySizeLimitBytes?: number;
}
export interface CacheComponentsExperimentalConfig {
    /** Enable `use cache` server cache components. Default: false */
    enabled?: boolean;
}
export interface ExperimentalConfig {
    typedApi?: TypedApiExperimentalConfig;
    cacheComponents?: CacheComponentsExperimentalConfig;
}
export type DeploymentTarget = 'auto' | 'vercel' | 'cloudflare' | 'render' | 'docker' | 'node';
export interface DeploymentConfig {
    /** Target hosting platform: 'auto' | 'vercel' | 'cloudflare' | 'render' | 'docker' | 'node'. Default: 'auto' */
    target?: DeploymentTarget;
    /** Custom directory for platform output artifacts (defaults to platform standard, e.g. .vercel/output, .vista/cloudflare) */
    outDir?: string;
    /** Automatically generate platform blueprint / config files (render.yaml, Dockerfile, etc.) if missing. Default: true */
    generateBlueprints?: boolean;
    /** Override port for container/server deployments. Default: 3003 (or PORT env) */
    port?: number;
}
export interface VistaConfig {
    images?: ImageConfig;
    react?: any;
    engine?: VistaEngineConfig | VistaEngineVariant | VistaEngineAlias;
    server?: {
        port?: number;
    };
    deployment?: DeploymentConfig;
    validation?: {
        structure?: StructureValidationConfig;
    };
    experimental?: ExperimentalConfig;
}
export declare const defaultStructureValidationConfig: Required<StructureValidationConfig>;
export declare const defaultTypedApiConfig: Required<TypedApiExperimentalConfig>;
export declare const defaultCacheComponentsConfig: Required<CacheComponentsExperimentalConfig>;
export declare const defaultDeploymentConfig: Required<DeploymentConfig>;
export declare const defaultConfig: VistaConfig;
/**
 * Resolve the effective structure validation config merging user overrides.
 */
export declare function resolveStructureValidationConfig(config: VistaConfig): Required<StructureValidationConfig>;
export declare function resolveDeploymentConfig(config?: VistaConfig | DeploymentConfig): Required<DeploymentConfig>;
export type ResolvedTypedApiConfig = Required<TypedApiExperimentalConfig>;
export type ResolvedCacheComponentsConfig = Required<CacheComponentsExperimentalConfig>;
export declare function resolveEngineVariant(config: VistaConfig, env?: NodeJS.ProcessEnv): VistaEngineVariant;
export declare function applyEngineVariantToEnv(variant: VistaEngineVariant, env?: NodeJS.ProcessEnv): VistaEngineVariant;
export declare function resolveAndApplyEngineVariant(config: VistaConfig, env?: NodeJS.ProcessEnv): VistaEngineVariant;
/**
 * Resolve and sanitize experimental typed API config.
 */
export declare function resolveTypedApiConfig(config: VistaConfig): ResolvedTypedApiConfig;
export declare function resolveCacheComponentsConfig(config: VistaConfig): ResolvedCacheComponentsConfig;
export declare function loadConfig(cwd?: string): VistaConfig;
