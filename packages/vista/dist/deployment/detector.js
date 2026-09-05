"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDeploymentTarget = normalizeDeploymentTarget;
exports.detectDeploymentTarget = detectDeploymentTarget;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function normalizeDeploymentTarget(raw) {
    if (typeof raw !== 'string')
        return null;
    const val = raw.trim().toLowerCase();
    if (val === 'vercel')
        return 'vercel';
    if (val === 'cloudflare' || val === 'cf' || val === 'pages')
        return 'cloudflare';
    if (val === 'render')
        return 'render';
    if (val === 'docker' || val === 'container')
        return 'docker';
    if (val === 'node' || val === 'standalone')
        return 'node';
    if (val === 'auto')
        return 'auto';
    return null;
}
function detectDeploymentTarget(cwd, deploymentConfig, explicitTarget) {
    // 1. Explicit argument / environment override
    const explicit = normalizeDeploymentTarget(explicitTarget) ||
        normalizeDeploymentTarget(process.env.VISTA_DEPLOY_TARGET);
    if (explicit && explicit !== 'auto') {
        return explicit;
    }
    // 2. User config target
    const fromConfig = normalizeDeploymentTarget(deploymentConfig?.target);
    if (fromConfig && fromConfig !== 'auto') {
        return fromConfig;
    }
    // 3. Platform environment variables
    if (process.env.VERCEL === '1' || process.env.NOW_REGION !== undefined) {
        return 'vercel';
    }
    if (process.env.CF_PAGES === '1' ||
        process.env.CLOUDFLARE_PAGES === '1' ||
        process.env.CF_ACCOUNT_ID !== undefined) {
        return 'cloudflare';
    }
    if (process.env.RENDER === 'true' ||
        process.env.RENDER_SERVICE_ID !== undefined ||
        process.env.RENDER_INSTANCE_ID !== undefined) {
        return 'render';
    }
    if (process.env.DOCKER === 'true' || process.env.DOCKER_CONTAINER === 'true') {
        return 'docker';
    }
    // 4. Project files heuristic
    if (fs_1.default.existsSync(path_1.default.join(cwd, 'vercel.json'))) {
        return 'vercel';
    }
    if (fs_1.default.existsSync(path_1.default.join(cwd, 'wrangler.toml'))) {
        return 'cloudflare';
    }
    if (fs_1.default.existsSync(path_1.default.join(cwd, 'render.yaml'))) {
        return 'render';
    }
    if (fs_1.default.existsSync(path_1.default.join(cwd, 'Dockerfile'))) {
        return 'docker';
    }
    return 'node';
}
