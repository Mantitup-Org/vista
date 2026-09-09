"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDeploymentOutputs = generateDeploymentOutputs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cloudflare_1 = require("./adapters/cloudflare");
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
    const vercelFunctionsDir = path_1.default.join(vercelOutputDir, 'functions');
    const vercelIndexFuncDir = path_1.default.join(vercelFunctionsDir, 'index.func');
    fs_1.default.rmSync(vercelOutputDir, { recursive: true, force: true });
    fs_1.default.mkdirSync(vercelStaticDir, { recursive: true });
    fs_1.default.mkdirSync(vercelIndexFuncDir, { recursive: true });
    // Public assets: /favicon.ico, /vista.svg, etc.
    copyDirectoryRecursive(path_1.default.join(cwd, 'public'), vercelStaticDir);
    // Vista static artifacts: /static/pages, /static/chunks, etc.
    copyDirectoryRecursive(path_1.default.join(vistaDir, 'static'), path_1.default.join(vercelStaticDir, 'static'));
    // Global CSS alias support (/styles.css and /client.css)
    const clientCssPath = path_1.default.join(vistaDir, 'client.css');
    copyFileIfPresent(clientCssPath, path_1.default.join(vercelStaticDir, 'client.css'));
    copyFileIfPresent(clientCssPath, path_1.default.join(vercelStaticDir, 'styles.css'));
    // Standalone server into function
    const standaloneDir = path_1.default.join(vistaDir, 'standalone');
    if (fs_1.default.existsSync(standaloneDir)) {
        copyDirectoryRecursive(standaloneDir, vercelIndexFuncDir);
        // .vc-config.json
        fs_1.default.writeFileSync(path_1.default.join(vercelIndexFuncDir, '.vc-config.json'), JSON.stringify({
            runtime: 'nodejs20.x',
            handler: 'server.js',
            launcherType: 'Nodejs',
        }, null, 2));
    }
    const config = {
        version: 3,
        routes: [
            { handle: 'filesystem' },
            { src: '^/_vista/(.*)$', dest: '/$1' },
            { src: '^/(?:rsc|_rsc)/?$', dest: '/static/pages/index.rsc' },
            { src: '^/(?:rsc|_rsc)/(.+)$', dest: '/static/pages/$1.rsc' },
            { src: '^/$', dest: '/static/pages/index.html' },
            { src: '^/(.+)$', dest: '/static/pages/$1.html' },
            { handle: 'miss' },
            { src: '^/.*$', dest: '/index' }
        ],
    };
    fs_1.default.writeFileSync(path_1.default.join(vercelOutputDir, 'config.json'), JSON.stringify(config, null, 2));
    if (debug) {
        console.log('[vista:deploy] Generated internal Vercel Build Output at .vercel/output/');
    }
}
function writeRenderBuildOutput(options) {
    const { cwd, debug } = options;
    if (process.env.RENDER !== '1') {
        return;
    }
    const renderYamlPath = path_1.default.join(cwd, 'render.yaml');
    if (fs_1.default.existsSync(renderYamlPath)) {
        if (debug) {
            console.log('[vista:deploy] Found custom render.yaml, skipping internal Render configuration.');
        }
        return;
    }
    // Create a default render.yaml
    const renderYamlContent = `services:
  - type: web
    name: vista-app
    env: node
    buildCommand: npm install && npm run build
    startCommand: node .vista/standalone/server.js
`;
    fs_1.default.writeFileSync(renderYamlPath, renderYamlContent);
    if (debug) {
        console.log('[vista:deploy] Generated default render.yaml for Render deployment.');
    }
}
function generateDeploymentOutputs(options) {
    writeVercelBuildOutput(options);
    writeRenderBuildOutput(options);
    (0, cloudflare_1.writeCloudflareBuildOutput)(options.cwd, options.vistaDir, options.debug);
}
