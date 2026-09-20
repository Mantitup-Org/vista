"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBuildArtifacts = validateBuildArtifacts;
exports.runStaticHostPreflight = runStaticHostPreflight;
exports.runStandalonePreflight = runStandalonePreflight;
exports.splitPreflightMessages = splitPreflightMessages;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const artifact_validator_1 = require("../server/artifact-validator");
const app_dir_1 = require("../server/app-dir");
const utils_1 = require("./utils");
function hasDynamicOnlyRoutes(vistaDir) {
    const routesManifest = (0, utils_1.readJsonSafe)(path_1.default.join(vistaDir, 'routes-manifest.json'));
    const prerenderManifest = (0, utils_1.readJsonSafe)(path_1.default.join(vistaDir, 'prerender-manifest.json'));
    const dynamicCount = routesManifest?.dynamicRoutes?.length ?? 0;
    const staticCount = routesManifest?.staticRoutes?.length ?? 0;
    const prerenderedCount = Object.keys(prerenderManifest?.routes ?? {}).length;
    const dynamicPrerenderCount = Object.keys(prerenderManifest?.dynamicRoutes ?? {}).length;
    if (dynamicCount > 0 && staticCount === 0 && prerenderedCount === 0) {
        return true;
    }
    if (dynamicPrerenderCount > 0 && prerenderedCount === 0) {
        return true;
    }
    return false;
}
function validateBuildArtifacts(ctx) {
    const missing = (0, artifact_validator_1.validateVistaArtifacts)(ctx.cwd, 'rsc');
    if (missing.length > 0) {
        return missing.map((entry) => `Missing build artifact: ${entry}`);
    }
    return [];
}
async function runStaticHostPreflight(ctx) {
    const warnings = [];
    const errors = [];
    const staticPagesDir = path_1.default.join(ctx.vistaDir, 'static', 'pages');
    if (!fs_1.default.existsSync(staticPagesDir)) {
        errors.push('No pre-rendered pages found at .vista/static/pages. Static hosts require SSG output from "vista build".');
    }
    if (hasDynamicOnlyRoutes(ctx.vistaDir)) {
        errors.push('This app appears to rely on dynamic server rendering without static fallbacks. Deploy to Render or Docker for full runtime support.');
    }
    const typedApi = (0, config_1.resolveTypedApiConfig)(ctx.config);
    if (typedApi.enabled) {
        errors.push('Typed API is enabled. Static CDN hosts cannot run typed API runtime. Use deploy.target "render" or "docker".');
    }
    const appApiDir = path_1.default.join((0, app_dir_1.resolveAppDir)(ctx.cwd), 'api');
    if (fs_1.default.existsSync(appApiDir)) {
        warnings.push('Found app/api routes. Server-side API routes are not supported on static CDN deploy targets.');
    }
    if (ctx.config.images && ctx.config.images.unoptimized !== true) {
        warnings.push('Consider setting images.unoptimized: true in vista.config.ts for static hosts without /_vista/image optimization.');
    }
    return [...errors, ...warnings.map((entry) => `warning:${entry}`)];
}
async function runStandalonePreflight(ctx) {
    const errors = [];
    const standaloneServer = path_1.default.join(ctx.vistaDir, 'standalone', 'server.js');
    if (!fs_1.default.existsSync(standaloneServer)) {
        errors.push('Missing .vista/standalone/server.js. Run "vista build" before deploying to Node hosts.');
    }
    return errors;
}
function splitPreflightMessages(messages) {
    const errors = [];
    const warnings = [];
    for (const message of messages) {
        if (message.startsWith('warning:')) {
            warnings.push(message.slice('warning:'.length));
        }
        else {
            errors.push(message);
        }
    }
    return { errors, warnings };
}
