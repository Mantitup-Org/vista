"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDeploymentOutputs = generateDeploymentOutputs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const adapters_1 = require("../adapters");
function isVercelBuildEnvironment() {
    return process.env.VERCEL === '1' || process.env.NOW_REGION !== undefined;
}
function hasUserVercelConfig(cwd) {
    return fs_1.default.existsSync(path_1.default.join(cwd, 'vercel.json'));
}
function copyDirectoryRecursive(sourceDir, targetDir) {
    if (!fs_1.default.existsSync(sourceDir))
        return;
    fs_1.default.mkdirSync(targetDir, { recursive: true });
    const entries = fs_1.default.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const from = path_1.default.join(sourceDir, entry.name);
        const to = path_1.default.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(from, to);
        }
        else if (entry.isFile()) {
            fs_1.default.copyFileSync(from, to);
        }
    }
}
function copyFileIfPresent(sourceFile, targetFile) {
    if (!fs_1.default.existsSync(sourceFile))
        return;
    fs_1.default.mkdirSync(path_1.default.dirname(targetFile), { recursive: true });
    fs_1.default.copyFileSync(sourceFile, targetFile);
}
function writeVercelBuildOutput(options) {
    const { cwd, vistaDir, debug } = options;
    if (!isVercelBuildEnvironment()) {
        return;
    }
    if (hasUserVercelConfig(cwd)) {
        if (debug) {
            console.log('[vista:deploy] Found custom vercel.json, skipping internal Vercel output.');
        }
        return;
    }
    const vercelOutputDir = path_1.default.join(cwd, '.vercel', 'output');
    const vercelStaticDir = path_1.default.join(vercelOutputDir, 'static');
    fs_1.default.rmSync(vercelOutputDir, { recursive: true, force: true });
    fs_1.default.mkdirSync(vercelStaticDir, { recursive: true });
    // Public assets: /favicon.ico, /vista.svg, etc.
    copyDirectoryRecursive(path_1.default.join(cwd, 'public'), vercelStaticDir);
    // Vista static artifacts: /static/pages, /static/chunks, etc.
    copyDirectoryRecursive(path_1.default.join(vistaDir, 'static'), path_1.default.join(vercelStaticDir, 'static'));
    // Global CSS alias support (/styles.css and /client.css)
    const clientCssPath = path_1.default.join(vistaDir, 'client.css');
    copyFileIfPresent(clientCssPath, path_1.default.join(vercelStaticDir, 'client.css'));
    copyFileIfPresent(clientCssPath, path_1.default.join(vercelStaticDir, 'styles.css'));
    const config = {
        version: 3,
        routes: [
            { handle: 'filesystem' },
            { src: '^/_vista/(.*)$', dest: '/$1' },
            { src: '^/(?:rsc|_rsc)/?$', dest: '/static/pages/index.rsc' },
            { src: '^/(?:rsc|_rsc)/(.+)$', dest: '/static/pages/$1.rsc' },
            { src: '^/$', dest: '/static/pages/index.html' },
            { src: '^/(.+)$', dest: '/static/pages/$1.html' },
        ],
    };
    fs_1.default.writeFileSync(path_1.default.join(vercelOutputDir, 'config.json'), JSON.stringify(config, null, 2));
    if (debug) {
        console.log('[vista:deploy] Generated internal Vercel Build Output at .vercel/output/');
    }
}
function generateDeploymentOutputs(options) {
    const { cwd, vistaDir, debug } = options;
    const targetAdapter = options.adapter || process.env.VISTA_ADAPTER;
    // Always generate node standalone build helper
    adapters_1.nodeAdapter.build({ cwd, vistaDir, debug });
    if (targetAdapter) {
        const custom = (0, adapters_1.getAdapter)(targetAdapter);
        if (custom) {
            custom.build({ cwd, vistaDir, debug });
            return;
        }
    }
    // Automatic platform detection
    if (isVercelBuildEnvironment() || targetAdapter === 'vercel') {
        writeVercelBuildOutput(options);
    }
    if (process.env.CF_PAGES === '1' || process.env.CLOUDFLARE_WORKERS === '1' || targetAdapter === 'cloudflare') {
        adapters_1.cloudflareAdapter.build({ cwd, vistaDir, debug });
    }
    if (process.env.RENDER === 'true' || targetAdapter === 'render') {
        adapters_1.renderAdapter.build({ cwd, vistaDir, debug });
    }
    if (targetAdapter === 'docker') {
        adapters_1.dockerAdapter.build({ cwd, vistaDir, debug });
    }
}
