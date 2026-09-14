"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = exports.defaultDeploymentConfig = exports.defaultCacheComponentsConfig = exports.defaultTypedApiConfig = exports.defaultStructureValidationConfig = void 0;
exports.resolveStructureValidationConfig = resolveStructureValidationConfig;
exports.resolveDeploymentConfig = resolveDeploymentConfig;
exports.resolveEngineVariant = resolveEngineVariant;
exports.applyEngineVariantToEnv = applyEngineVariantToEnv;
exports.resolveAndApplyEngineVariant = resolveAndApplyEngineVariant;
exports.resolveTypedApiConfig = resolveTypedApiConfig;
exports.resolveCacheComponentsConfig = resolveCacheComponentsConfig;
exports.loadConfig = loadConfig;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const NodeModule = require('module');
exports.defaultStructureValidationConfig = {
    enabled: true,
    mode: 'strict',
    includeWarningsInOverlay: false,
    logLevel: 'compact',
    watchDebounceMs: 120,
};
exports.defaultTypedApiConfig = {
    enabled: false,
    serialization: 'json',
    bodySizeLimitBytes: 1024 * 1024,
};
exports.defaultCacheComponentsConfig = {
    enabled: false,
};
exports.defaultDeploymentConfig = {
    target: 'auto',
    outDir: '',
    generateBlueprints: true,
    port: 3003,
};
exports.defaultConfig = {
    images: {},
    engine: {
        variant: 'default',
    },
    deployment: { ...exports.defaultDeploymentConfig },
    validation: {
        structure: { ...exports.defaultStructureValidationConfig },
    },
    experimental: {
        typedApi: { ...exports.defaultTypedApiConfig },
        cacheComponents: { ...exports.defaultCacheComponentsConfig },
    },
};
/**
 * Resolve the effective structure validation config merging user overrides.
 */
function resolveStructureValidationConfig(config) {
    return {
        ...exports.defaultStructureValidationConfig,
        ...(config.validation?.structure ?? {}),
    };
}
function resolveDeploymentConfig(config) {
    const deployment = config && typeof config === 'object' && 'deployment' in config
        ? config.deployment
        : config;
    return {
        ...exports.defaultDeploymentConfig,
        ...(deployment ?? {}),
    };
}
function normalizeEngineVariant(raw) {
    const value = String(raw ?? '')
        .trim()
        .toLowerCase();
    if (!value)
        return undefined;
    if (value === 'default' || value === 'webpack')
        return 'default';
    if (value === 'flashpack')
        return 'flashpack';
    return undefined;
}
function readEngineVariantFromConfig(config) {
    if (!config || !config.engine)
        return undefined;
    if (typeof config.engine === 'string') {
        return normalizeEngineVariant(config.engine);
    }
    return normalizeEngineVariant(config.engine.variant);
}
function readEngineVariantFromEnv(env) {
    const explicit = normalizeEngineVariant(env.VISTA_ENGINE_VARIANT || env.VISTA_ENGINE);
    if (explicit)
        return explicit;
    if (env.VISTA_FLASHPACK === 'true')
        return 'flashpack';
    if (env.VISTA_FLASHPACK === 'false')
        return 'default';
    return undefined;
}
function resolveEngineVariant(config, env = process.env) {
    return readEngineVariantFromEnv(env) || readEngineVariantFromConfig(config) || 'default';
}
function applyEngineVariantToEnv(variant, env = process.env) {
    env.VISTA_ENGINE = variant;
    env.VISTA_ENGINE_VARIANT = variant;
    env.VISTA_FLASHPACK = variant === 'flashpack' ? 'true' : 'false';
    return variant;
}
function resolveAndApplyEngineVariant(config, env = process.env) {
    const variant = resolveEngineVariant(config, env);
    return applyEngineVariantToEnv(variant, env);
}
/**
 * Resolve and sanitize experimental typed API config.
 */
function resolveTypedApiConfig(config) {
    const merged = {
        ...exports.defaultTypedApiConfig,
        ...(config.experimental?.typedApi ?? {}),
    };
    const serialization = merged.serialization === 'superjson' ? 'superjson' : 'json';
    const parsedLimit = Number(merged.bodySizeLimitBytes);
    const bodySizeLimitBytes = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.floor(parsedLimit)
        : exports.defaultTypedApiConfig.bodySizeLimitBytes;
    return {
        enabled: Boolean(merged.enabled),
        serialization,
        bodySizeLimitBytes,
    };
}
function resolveCacheComponentsConfig(config) {
    const merged = {
        ...exports.defaultCacheComponentsConfig,
        ...(config.experimental?.cacheComponents ?? {}),
    };
    return {
        enabled: Boolean(merged.enabled),
    };
}
function mergeConfig(userConfig) {
    const mergedBase = {
        ...exports.defaultConfig,
        ...userConfig,
    };
    const resolvedEngineVariant = readEngineVariantFromConfig(userConfig) ||
        readEngineVariantFromConfig(exports.defaultConfig) ||
        'default';
    return {
        ...mergedBase,
        engine: {
            variant: resolvedEngineVariant,
        },
        images: {
            ...(exports.defaultConfig.images ?? {}),
            ...(userConfig.images ?? {}),
        },
        server: {
            ...(exports.defaultConfig.server ?? {}),
            ...(userConfig.server ?? {}),
        },
        deployment: {
            ...exports.defaultDeploymentConfig,
            ...(userConfig.deployment ?? {}),
        },
        validation: {
            ...(exports.defaultConfig.validation ?? {}),
            ...(userConfig.validation ?? {}),
            structure: {
                ...exports.defaultStructureValidationConfig,
                ...(userConfig.validation?.structure ?? {}),
            },
        },
        experimental: {
            ...(exports.defaultConfig.experimental ?? {}),
            ...(userConfig.experimental ?? {}),
            typedApi: {
                ...exports.defaultTypedApiConfig,
                ...(userConfig.experimental?.typedApi ?? {}),
            },
            cacheComponents: {
                ...exports.defaultCacheComponentsConfig,
                ...(userConfig.experimental?.cacheComponents ?? {}),
            },
        },
    };
}
function loadBundledConfigModule(configPath, cwd) {
    const { buildSync } = require('esbuild');
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
    const virtualConfigPath = path_1.default.join(path_1.default.dirname(configPath), `.__vista_config_runtime__.${path_1.default.basename(configPath, path_1.default.extname(configPath))}.cjs`);
    const runtimeModule = new NodeModule(virtualConfigPath, module);
    runtimeModule.filename = virtualConfigPath;
    runtimeModule.paths = NodeModule._nodeModulePaths(path_1.default.dirname(configPath));
    runtimeModule._compile(bundledConfig, virtualConfigPath);
    return runtimeModule.exports;
}
function loadConfig(cwd = process.cwd()) {
    const tsPath = path_1.default.join(cwd, 'vista.config.ts');
    const jsPath = path_1.default.join(cwd, 'vista.config.js');
    try {
        if (fs_1.default.existsSync(tsPath)) {
            const mod = loadBundledConfigModule(tsPath, cwd);
            return mergeConfig(mod.default || mod);
        }
        else if (fs_1.default.existsSync(jsPath)) {
            const mod = loadBundledConfigModule(jsPath, cwd);
            return mergeConfig(mod.default || mod);
        }
    }
    catch (error) {
        console.error('Error loading vista.config:', error);
    }
    return mergeConfig({});
}
