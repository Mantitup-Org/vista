import fs from 'fs';
import path from 'path';
import type { DeploymentAdapter, DeploymentContext, DeploymentResult } from '../types';

function copyDirectoryRecursive(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) return;

  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const from = path.join(sourceDir, entry.name);
    const to = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function copyFileIfPresent(sourceFile: string, targetFile: string): void {
  if (!fs.existsSync(sourceFile)) return;
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.copyFileSync(sourceFile, targetFile);
}

export const vercelAdapter: DeploymentAdapter = {
  target: 'vercel',
  name: 'Vercel Build Output API v3',

  generate(context: DeploymentContext): DeploymentResult {
    const { cwd, vistaDir, debug, deploymentConfig } = context;
    const generatedFiles: string[] = [];

    const vercelOutputDir = deploymentConfig.outDir
      ? path.resolve(cwd, deploymentConfig.outDir)
      : path.join(cwd, '.vercel', 'output');
    const vercelStaticDir = path.join(vercelOutputDir, 'static');
    const vercelFunctionsDir = path.join(vercelOutputDir, 'functions');
    const indexFuncDir = path.join(vercelFunctionsDir, 'index.func');

    fs.rmSync(vercelOutputDir, { recursive: true, force: true });
    fs.mkdirSync(vercelStaticDir, { recursive: true });
    fs.mkdirSync(indexFuncDir, { recursive: true });

    // 1. Static Public assets (/favicon.ico, /vista.svg, etc.)
    const publicDir = path.join(cwd, 'public');
    if (fs.existsSync(publicDir)) {
      copyDirectoryRecursive(publicDir, vercelStaticDir);
    }

    // 2. Vista static artifacts (/static/pages, /static/chunks, etc.)
    const vistaStaticDir = path.join(vistaDir, 'static');
    if (fs.existsSync(vistaStaticDir)) {
      copyDirectoryRecursive(vistaStaticDir, path.join(vercelStaticDir, 'static'));
    }

    // 3. Global CSS assets
    const clientCssPath = path.join(vistaDir, 'client.css');
    copyFileIfPresent(clientCssPath, path.join(vercelStaticDir, 'client.css'));
    copyFileIfPresent(clientCssPath, path.join(vercelStaticDir, 'styles.css'));

    // 4. Serverless Function: index.func (.vc-config.json + index.js)
    const vcConfig = {
      runtime: 'nodejs20.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
      maxDuration: 15,
      memory: 1024,
    };
    const vcConfigPath = path.join(indexFuncDir, '.vc-config.json');
    fs.writeFileSync(vcConfigPath, JSON.stringify(vcConfig, null, 2));
    generatedFiles.push(vcConfigPath);

    // Standalone server bundle into function directory
    const standaloneSourceDir = path.join(vistaDir, 'standalone');
    if (fs.existsSync(standaloneSourceDir)) {
      copyDirectoryRecursive(standaloneSourceDir, path.join(indexFuncDir, 'standalone'));
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

    const indexJsPath = path.join(indexFuncDir, 'index.js');
    fs.writeFileSync(indexJsPath, functionHandlerCode);
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

    const configPath = path.join(vercelOutputDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(vercelConfig, null, 2));
    generatedFiles.push(configPath);

    // 6. Optional vercel.json blueprint
    if (deploymentConfig.generateBlueprints && !fs.existsSync(path.join(cwd, 'vercel.json'))) {
      const blueprintFiles = this.generateBlueprint!(context);
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

  generateBlueprint(context: DeploymentContext): string[] {
    const { cwd } = context;
    const targetFile = path.join(cwd, 'vercel.json');
    if (fs.existsSync(targetFile)) return [];

    const vercelJson = {
      version: 2,
      buildCommand: 'npm run build',
      outputDirectory: '.vercel/output',
      framework: null,
      installCommand: 'npm install --no-audit --no-fund',
      devCommand: 'npm run dev',
    };

    fs.writeFileSync(targetFile, JSON.stringify(vercelJson, null, 2));
    return [targetFile];
  },
};
