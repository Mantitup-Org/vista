"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listKnownTargets = exports.resolveDeployTarget = exports.hasUserVercelConfig = exports.isVercelBuildEnvironment = exports.writeVercelBuildOutput = void 0;
exports.runDeploy = runDeploy;
exports.generateDeploymentOutputs = generateDeploymentOutputs;
const path_1 = __importDefault(require("path"));
const constants_1 = require("../constants");
const config_1 = require("../config");
const adapters_1 = require("./adapters");
const detect_1 = require("./detect");
const preflight_1 = require("./preflight");
var vercel_1 = require("./adapters/vercel");
Object.defineProperty(exports, "writeVercelBuildOutput", { enumerable: true, get: function () { return vercel_1.writeVercelBuildOutput; } });
Object.defineProperty(exports, "isVercelBuildEnvironment", { enumerable: true, get: function () { return vercel_1.isVercelBuildEnvironment; } });
Object.defineProperty(exports, "hasUserVercelConfig", { enumerable: true, get: function () { return vercel_1.hasUserVercelConfig; } });
var detect_2 = require("./detect");
Object.defineProperty(exports, "resolveDeployTarget", { enumerable: true, get: function () { return detect_2.resolveDeployTarget; } });
Object.defineProperty(exports, "listKnownTargets", { enumerable: true, get: function () { return detect_2.listKnownTargets; } });
function createContext(options) {
    const cwd = options.cwd ?? process.cwd();
    const config = (0, config_1.loadConfig)(cwd);
    const deployConfig = (0, config_1.resolveDeployConfig)(config);
    if (options.output) {
        deployConfig.output = options.output;
    }
    const target = (0, detect_1.resolveDeployTarget)(cwd, deployConfig, options.target ?? null);
    return {
        cwd,
        vistaDir: path_1.default.join(cwd, constants_1.BUILD_DIR),
        config,
        deployConfig,
        target,
        dryRun: Boolean(options.dryRun),
        skipBuild: Boolean(options.skipBuild),
        prod: options.preview ? false : options.prod !== false,
        preview: Boolean(options.preview),
        force: Boolean(options.force),
        debug: options.debug,
        log: options.log,
        warn: options.warn,
        error: options.error,
    };
}
function printResult(ctx, result) {
    const log = ctx.log ?? console.log;
    const warn = ctx.warn ?? console.warn;
    log('');
    log(`[vista:deploy] Target: ${result.target}`);
    log(`[vista:deploy] Status: ${result.status}`);
    if (result.url) {
        log(`[vista:deploy] URL: ${result.url}`);
    }
    if (result.artifactPaths?.length) {
        log('[vista:deploy] Artifacts:');
        for (const artifact of result.artifactPaths) {
            log(`  - ${artifact}`);
        }
    }
    if (result.warnings?.length) {
        for (const message of result.warnings) {
            warn(`[vista:deploy] Warning: ${message}`);
        }
    }
    if (result.instructions?.length) {
        log('[vista:deploy] Next steps:');
        for (const instruction of result.instructions) {
            log(`  - ${instruction}`);
        }
    }
    log('');
}
async function runDeploy(options = {}) {
    const ctx = createContext(options);
    const adapter = (0, adapters_1.getDeployAdapter)(ctx.target);
    const log = ctx.log ?? console.log;
    const error = ctx.error ?? console.error;
    if (!options.skipBuild) {
        if (options.build) {
            log('[vista:deploy] Running production build...');
            await options.build(ctx.cwd);
        }
        else {
            error('[vista:deploy] Internal error: build callback is required.');
            return { status: 'failed', target: ctx.target, warnings: ['Missing build callback.'] };
        }
    }
    const artifactErrors = (0, preflight_1.validateBuildArtifacts)(ctx);
    if (artifactErrors.length > 0) {
        for (const message of artifactErrors) {
            error(`[vista:deploy] ${message}`);
        }
        return { status: 'failed', target: ctx.target, warnings: artifactErrors };
    }
    const preflightMessages = await adapter.preflight(ctx);
    const { errors, warnings } = (0, preflight_1.splitPreflightMessages)(preflightMessages);
    if (errors.length > 0) {
        for (const message of errors) {
            error(`[vista:deploy] ${message}`);
        }
        return { status: 'failed', target: ctx.target, warnings: [...warnings, ...errors] };
    }
    for (const message of warnings) {
        (ctx.warn ?? console.warn)(`[vista:deploy] Warning: ${message}`);
    }
    const result = ctx.dryRun ? await adapter.emit(ctx) : await adapter.deploy(ctx);
    printResult(ctx, result);
    return result;
}
function generateDeploymentOutputs(options) {
    const { writeVercelBuildOutput } = require('./adapters/vercel');
    writeVercelBuildOutput({ ...options, force: false });
}
