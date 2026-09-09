import fs from 'fs';
import path from 'path';
import { writeCloudflareBuildOutput } from './adapters/cloudflare';

interface DeployOutputOptions {
  cwd: string;
  vistaDir: string;
  debug?: boolean;
}

function isVercelBuildEnvironment(): boolean {
  return process.env.VERCEL === '1' || process.env.NOW_REGION !== undefined;
}

function hasUserVercelConfig(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'vercel.json'));
}

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

function writeVercelBuildOutput(options: DeployOutputOptions): void {
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

  const vercelOutputDir = path.join(cwd, '.vercel', 'output');
  const vercelStaticDir = path.join(vercelOutputDir, 'static');
  const vercelFunctionsDir = path.join(vercelOutputDir, 'functions');
  const vercelIndexFuncDir = path.join(vercelFunctionsDir, 'index.func');

  fs.rmSync(vercelOutputDir, { recursive: true, force: true });
  fs.mkdirSync(vercelStaticDir, { recursive: true });
  fs.mkdirSync(vercelIndexFuncDir, { recursive: true });

  // Public assets: /favicon.ico, /vista.svg, etc.
  copyDirectoryRecursive(path.join(cwd, 'public'), vercelStaticDir);

  // Vista static artifacts: /static/pages, /static/chunks, etc.
  copyDirectoryRecursive(path.join(vistaDir, 'static'), path.join(vercelStaticDir, 'static'));

  // Global CSS alias support (/styles.css and /client.css)
  const clientCssPath = path.join(vistaDir, 'client.css');
  copyFileIfPresent(clientCssPath, path.join(vercelStaticDir, 'client.css'));
  copyFileIfPresent(clientCssPath, path.join(vercelStaticDir, 'styles.css'));

  // Standalone server into function
  const standaloneDir = path.join(vistaDir, 'standalone');
  if (fs.existsSync(standaloneDir)) {
    copyDirectoryRecursive(standaloneDir, vercelIndexFuncDir);
    
    // .vc-config.json
    fs.writeFileSync(
      path.join(vercelIndexFuncDir, '.vc-config.json'),
      JSON.stringify(
        {
          runtime: 'nodejs20.x',
          handler: 'server.js',
          launcherType: 'Nodejs',
        },
        null,
        2
      )
    );
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

  fs.writeFileSync(path.join(vercelOutputDir, 'config.json'), JSON.stringify(config, null, 2));

  if (debug) {
    console.log('[vista:deploy] Generated internal Vercel Build Output at .vercel/output/');
  }
}

function writeRenderBuildOutput(options: DeployOutputOptions): void {
  const { cwd, debug } = options;

  if (process.env.RENDER !== '1') {
    return;
  }

  const renderYamlPath = path.join(cwd, 'render.yaml');
  if (fs.existsSync(renderYamlPath)) {
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

  fs.writeFileSync(renderYamlPath, renderYamlContent);

  if (debug) {
    console.log('[vista:deploy] Generated default render.yaml for Render deployment.');
  }
}

export function generateDeploymentOutputs(options: DeployOutputOptions): void {
  writeVercelBuildOutput(options);
  writeRenderBuildOutput(options);
  writeCloudflareBuildOutput(options.cwd, options.vistaDir, options.debug);
}

