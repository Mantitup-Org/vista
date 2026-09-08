"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeResolvedTarget = normalizeResolvedTarget;
exports.resolveDeployTarget = resolveDeployTarget;
exports.resolveEffectiveOutput = resolveEffectiveOutput;
exports.listKnownTargets = listKnownTargets;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const PLATFORM_FILES = [
    { target: 'render', file: 'render.yaml' },
    { target: 'vercel', file: 'vercel.json' },
    { target: 'cloudflare', file: 'wrangler.toml' },
    { target: 'netlify', file: 'netlify.toml' },
    { target: 'docker', file: 'Dockerfile' },
];
function detectFromEnv() {
    if (process.env.VERCEL === '1' || process.env.NOW_REGION)
        return 'vercel';
    if (process.env.CF_PAGES === '1' || process.env.CLOUDFLARE_PAGES)
        return 'cloudflare';
    if (process.env.RENDER === 'true' || process.env.RENDER_SERVICE_ID)
        return 'render';
    if (process.env.NETLIFY === 'true' || process.env.NETLIFY_SITE_ID)
        return 'netlify';
    return null;
}
function detectFromProjectFiles(cwd) {
    for (const entry of PLATFORM_FILES) {
        if (fs_1.default.existsSync(path_1.default.join(cwd, entry.file))) {
            return entry.target;
        }
    }
    return null;
}
function normalizeResolvedTarget(raw) {
    const value = String(raw ?? '')
        .trim()
        .toLowerCase();
    if (value === 'render' ||
        value === 'vercel' ||
        value === 'cloudflare' ||
        value === 'netlify' ||
        value === 'docker') {
        return value;
    }
    return null;
}
function resolveDeployTarget(cwd, deployConfig, cliTarget) {
    const explicitCli = normalizeResolvedTarget(cliTarget);
    if (explicitCli)
        return explicitCli;
    if (deployConfig.target !== 'auto') {
        const fromConfig = normalizeResolvedTarget(deployConfig.target);
        if (fromConfig)
            return fromConfig;
    }
    const fromEnv = detectFromEnv();
    if (fromEnv)
        return fromEnv;
    const fromFiles = detectFromProjectFiles(cwd);
    if (fromFiles)
        return fromFiles;
    throw new Error('[vista:deploy] Unable to detect deployment target. Pass --target <render|vercel|cloudflare|netlify|docker> or set deploy.target in vista.config.ts.');
}
function resolveEffectiveOutput(deployConfig, target) {
    if (deployConfig.output !== 'standalone') {
        return deployConfig.output;
    }
    return (0, config_1.inferDeployOutputForTarget)(target);
}
function listKnownTargets() {
    return ['auto', 'render', 'vercel', 'cloudflare', 'netlify', 'docker'];
}
