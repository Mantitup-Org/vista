import path from 'path';
import fs from 'fs';
import { ImageConfig } from './image/image-config';
const NodeModule = require('module');

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
  // Add other future config options here suitable for user requests
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

export const defaultStructureValidationConfig: Required<StructureValidationConfig> = {
  enabled: true,
  mode: 'strict',
  includeWarningsInOverlay: false,
  logLevel: 'compact',
  watchDebounceMs: 120,
};

export const defaultTypedApiConfig: Required<TypedApiExperimentalConfig> = {
  enabled: false,
  serialization: 'json',
  bodySizeLimitBytes: 1024 * 1024,
};

export const defaultCacheComponentsConfig: Required<CacheComponentsExperimentalConfig> = {
  enabled: false,
};

export const defaultDeploymentConfig: Required<DeploymentConfig> = {
  target: 'auto',
  outDir: '',
  generateBlueprints: true,
  port: 3003,
};

export const defaultConfig: VistaConfig = {
  images: {},
  engine: {
    variant: 'default',
  },
  deployment: { ...defaultDeploymentConfig },
  validation: {
    structure: { ...defaultStructureValidationConfig },
  },
  experimental: {
    typedApi: { ...defaultTypedApiConfig },
    cacheComponents: { ...defaultCacheComponentsConfig },
  },
};

/**
 * Resolve the effective structure validation config merging user overrides.
 */
export function resolveStructureValidationConfig(
  config: VistaConfig
): Required<StructureValidationConfig> {
  return {
    ...defaultStructureValidationConfig,
    ...(config.validation?.structure ?? {}),
  };
}

export function resolveDeploymentConfig(
  config?: VistaConfig | DeploymentConfig
): Required<DeploymentConfig> {
  const deployment =
    config && typeof config === 'object' && 'deployment' in config
      ? (config as VistaConfig).deployment
      : (config as DeploymentConfig | undefined);

  return {
    ...defaultDeploymentConfig,
    ...(deployment ?? {}),
  };
}

export type ResolvedTypedApiConfig = Required<TypedApiExperimentalConfig>;
export type ResolvedCacheComponentsConfig = Required<CacheComponentsExperimentalConfig>;

function normalizeEngineVariant(raw: unknown): VistaEngineVariant | undefined {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();

  if (!value) return undefined;
  if (value === 'default' || value === 'webpack') return 'default';
  if (value === 'flashpack') return 'flashpack';
  return undefined;
}

function readEngineVariantFromConfig(config: VistaConfig): VistaEngineVariant | undefined {
  if (!config || !config.engine) return undefined;

  if (typeof config.engine === 'string') {
    return normalizeEngineVariant(config.engine);
  }

  return normalizeEngineVariant(config.engine.variant);
}

function readEngineVariantFromEnv(env: NodeJS.ProcessEnv): VistaEngineVariant | undefined {
  const explicit = normalizeEngineVariant(env.VISTA_ENGINE_VARIANT || env.VISTA_ENGINE);
  if (explicit) return explicit;

  if (env.VISTA_FLASHPACK === 'true') return 'flashpack';
  if (env.VISTA_FLASHPACK === 'false') return 'default';

  return undefined;
}

export function resolveEngineVariant(
  config: VistaConfig,
  env: NodeJS.ProcessEnv = process.env
): VistaEngineVariant {
  return readEngineVariantFromEnv(env) || readEngineVariantFromConfig(config) || 'default';
}

export function applyEngineVariantToEnv(
  variant: VistaEngineVariant,
  env: NodeJS.ProcessEnv = process.env
): VistaEngineVariant {
  env.VISTA_ENGINE = variant;
  env.VISTA_ENGINE_VARIANT = variant;
  env.VISTA_FLASHPACK = variant === 'flashpack' ? 'true' : 'false';
  return variant;
}

export function resolveAndApplyEngineVariant(
  config: VistaConfig,
  env: NodeJS.ProcessEnv = process.env
): VistaEngineVariant {
  const variant = resolveEngineVariant(config, env);
  return applyEngineVariantToEnv(variant, env);
}

/**
 * Resolve and sanitize experimental typed API config.
 */
export function resolveTypedApiConfig(config: VistaConfig): ResolvedTypedApiConfig {
  const merged = {
    ...defaultTypedApiConfig,
    ...(config.experimental?.typedApi ?? {}),
  };

  const serialization: TypedApiSerialization =
    merged.serialization === 'superjson' ? 'superjson' : 'json';
  const parsedLimit = Number(merged.bodySizeLimitBytes);
  const bodySizeLimitBytes =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : defaultTypedApiConfig.bodySizeLimitBytes;

  return {
    enabled: Boolean(merged.enabled),
    serialization,
    bodySizeLimitBytes,
  };
}

export function resolveCacheComponentsConfig(config: VistaConfig): ResolvedCacheComponentsConfig {
  const merged = {
    ...defaultCacheComponentsConfig,
    ...(config.experimental?.cacheComponents ?? {}),
  };

  return {
    enabled: Boolean(merged.enabled),
  };
}

function mergeConfig(userConfig: VistaConfig): VistaConfig {
  const mergedBase = {
    ...defaultConfig,
    ...userConfig,
  };

  const resolvedEngineVariant =
    readEngineVariantFromConfig(userConfig) ||
    readEngineVariantFromConfig(defaultConfig) ||
    'default';

  return {
    ...mergedBase,
    engine: {
      variant: resolvedEngineVariant,
    },
    images: {
      ...(defaultConfig.images ?? {}),
      ...(userConfig.images ?? {}),
    },
    server: {
      ...(defaultConfig.server ?? {}),
      ...(userConfig.server ?? {}),
    },
    deployment: {
      ...defaultDeploymentConfig,
      ...(userConfig.deployment ?? {}),
    },
    validation: {
      ...(defaultConfig.validation ?? {}),
      ...(userConfig.validation ?? {}),
      structure: {
        ...defaultStructureValidationConfig,
        ...(userConfig.validation?.structure ?? {}),
      },
    },
    experimental: {
      ...(defaultConfig.experimental ?? {}),
      ...(userConfig.experimental ?? {}),
      typedApi: {
        ...defaultTypedApiConfig,
        ...(userConfig.experimental?.typedApi ?? {}),
      },
      cacheComponents: {
        ...defaultCacheComponentsConfig,
        ...(userConfig.experimental?.cacheComponents ?? {}),
      },
    },
  };
}

function loadBundledConfigModule(configPath: string, cwd: string): any {
  const { buildSync } = require('esbuild') as typeof import('esbuild');

  const result = buildSync({
    entryPoints: [configPath],
    absWorkingDir: cwd,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node20'],
    write: false,
    packages: 'external',
    sourcemap: false,
    logLevel: 'silent',
  });

  const bundledConfig = result.outputFiles?.[0]?.text;
  if (!bundledConfig) {
    throw new Error(`Failed to bundle config: ${configPath}`);
  }

  const virtualConfigPath = path.join(
    path.dirname(configPath),
    `.__vista_config_runtime__.${path.basename(configPath, path.extname(configPath))}.cjs`
  );

  const runtimeModule = new NodeModule(virtualConfigPath, module);
  runtimeModule.filename = virtualConfigPath;
  runtimeModule.paths = NodeModule._nodeModulePaths(path.dirname(configPath));
  runtimeModule._compile(bundledConfig, virtualConfigPath);
  return runtimeModule.exports;
}

export function loadConfig(cwd: string = process.cwd()): VistaConfig {
  const tsPath = path.join(cwd, 'vista.config.ts');
  const jsPath = path.join(cwd, 'vista.config.js');

  try {
    if (fs.existsSync(tsPath)) {
      const mod = loadBundledConfigModule(tsPath, cwd);
      return mergeConfig(mod.default || mod);
    } else if (fs.existsSync(jsPath)) {
      const mod = loadBundledConfigModule(jsPath, cwd);
      return mergeConfig(mod.default || mod);
    }
  } catch (error) {
    console.error('Error loading vista.config:', error);
  }
  return mergeConfig({});
}
