"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vercelAdapter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
exports.vercelAdapter = {
    target: 'vercel',
    name: 'Vercel Build Output API v3',
    generate(context) {
        const { cwd, vistaDir, debug, deploymentConfig } = context;
        const generatedFiles = [];
        const vercelOutputDir = deploymentConfig.outDir
            ? path_1.default.resolve(cwd, deploymentConfig.outDir)
            : path_1.default.join(cwd, '.vercel', 'output');
        const vercelStaticDir = path_1.default.join(vercelOutputDir, 'static');
        const vercelFunctionsDir = path_1.default.join(vercelOutputDir, 'functions');
        const indexFuncDir = path_1.default.join(vercelFunctionsDir, 'index.func');
        fs_1.default.rmSync(vercelOutputDir, { recursive: true, force: true });
        fs_1.default.mkdirSync(vercelStaticDir, { recursive: true });
        fs_1.default.mkdirSync(indexFuncDir, { recursive: true });
        // 1. Static Public assets (/favicon.ico, /vista.svg, etc.)
        const publicDir = path_1.default.join(cwd, 'public');
        if (fs_1.default.existsSync(publicDir)) {
            copyDirectoryRecursive(publicDir, vercelStaticDir);
        }
        // 2. Vista static artifacts (/static/pages, /static/chunks, etc.)
        const vistaStaticDir = path_1.default.join(vistaDir, 'static');
        if (fs_1.default.existsSync(vistaStaticDir)) {
            copyDirectoryRecursive(vistaStaticDir, path_1.default.join(vercelStaticDir, 'static'));
        }
        // 3. Global CSS assets
        const clientCssPath = path_1.default.join(vistaDir, 'client.css');
        copyFileIfPresent(clientCssPath, path_1.default.join(vercelStaticDir, 'client.css'));
        copyFileIfPresent(clientCssPath, path_1.default.join(vercelStaticDir, 'styles.css'));
        // 4. Serverless Function: index.func (.vc-config.json + index.js)
        const vcConfig = {
            runtime: 'nodejs20.x',
            handler: 'index.js',
            launcherType: 'Nodejs',
            maxDuration: 15,
            memory: 1024,
        };
        const vcConfigPath = path_1.default.join(indexFuncDir, '.vc-config.json');
        fs_1.default.writeFileSync(vcConfigPath, JSON.stringify(vcConfig, null, 2));
        generatedFiles.push(vcConfigPath);
        // Standalone server bundle into function directory
        const standaloneSourceDir = path_1.default.join(vistaDir, 'standalone');
        if (fs_1.default.existsSync(standaloneSourceDir)) {
            copyDirectoryRecursive(standaloneSourceDir, path_1.default.join(indexFuncDir, 'standalone'));
        }
        const functionHandlerCode = [
            "'use strict';",
            "const path = require('path');",
            "const fs = require('fs');",
            '',
            'let cachedHandler = null;',
            '',
            'function getHandler() {',
            '  if (cachedHandler) return cachedHandler;',
            "  const standalonePath = path.join(__dirname, 'standalone', 'server.js');",
            '  if (fs.existsSync(standalonePath)) {',
            '    const mod = require(standalonePath);',
            '    cachedHandler = mod.createRequestListener ? mod.createRequestListener() : mod;',
            '    return cachedHandler;',
            '  }',
            '  return (req, res) => {',
            '    res.statusCode = 200;',
            "    res.setHeader('Content-Type', 'text/html');",
            "    res.end('<h1>Vista App Running on Vercel</h1>');",
            '  };',
            '}',
            '',
            'module.exports = (req, res) => {',
            '  const handler = getHandler();',
            '  return handler(req, res);',
            '};',
            '',
        ].join('\n');
        const indexJsPath = path_1.default.join(indexFuncDir, 'index.js');
        fs_1.default.writeFileSync(indexJsPath, functionHandlerCode);
        generatedFiles.push(indexJsPath);
        // 5. Vercel routes config (config.json)
        const vercelConfig = {
            version: 3,
            routes: [
                { handle: 'filesystem' },
                { src: '^/_vista/(.*)$', dest: '/$1' },
                { src: '^/(?:rsc|_rsc)/?$', dest: '/static/pages/index.rsc' },
                { src: '^/(?:rsc|_rsc)/(.+)$', dest: '/static/pages/$1.rsc' },
                { src: '^/static/(.*)$', dest: '/static/$1' },
                { src: '^/api/(.*)$', dest: '/index' },
                { src: '^/(.*)$', dest: '/index' },
            ],
            overrides: {},
        };
        const configPath = path_1.default.join(vercelOutputDir, 'config.json');
        fs_1.default.writeFileSync(configPath, JSON.stringify(vercelConfig, null, 2));
        generatedFiles.push(configPath);
        // 6. Optional vercel.json blueprint
        if (deploymentConfig.generateBlueprints && !fs_1.default.existsSync(path_1.default.join(cwd, 'vercel.json'))) {
            const blueprintFiles = this.generateBlueprint(context);
            generatedFiles.push(...blueprintFiles);
        }
        if (debug) {
            console.log(`[vista:deploy:vercel] Generated Vercel Build Output at ${vercelOutputDir}`);
        }
        return {
            target: 'vercel',
            success: true,
            outputDirectory: vercelOutputDir,
            generatedFiles,
            notes: [
                'Vercel Build Output API v3 created at .vercel/output',
                'Static assets routed via filesystem handler',
                'SSR and API routes routed to serverless function index.func',
            ],
        };
    },
    generateBlueprint(context) {
        const { cwd } = context;
        const targetFile = path_1.default.join(cwd, 'vercel.json');
        if (fs_1.default.existsSync(targetFile))
            return [];
        const vercelJson = {
            version: 2,
            buildCommand: 'npm run build',
            outputDirectory: '.vercel/output',
            framework: null,
            installCommand: 'npm install --no-audit --no-fund',
            devCommand: 'npm run dev',
        };
        fs_1.default.writeFileSync(targetFile, JSON.stringify(vercelJson, null, 2));
        return [targetFile];
    },
};
