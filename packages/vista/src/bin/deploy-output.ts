import fs from 'fs';
import path from 'path';
import {
  nodeAdapter,
  vercelAdapter,
  cloudflareAdapter,
  renderAdapter,
  dockerAdapter,
  getAdapter,
} from '../adapters';

interface DeployOutputOptions {
  cwd: string;
  vistaDir: string;
  debug?: boolean;
  adapter?: string;
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

  fs.rmSync(vercelOutputDir, { recursive: true, force: true });
  fs.mkdirSync(vercelStaticDir, { recursive: true });

  // Public assets: /favicon.ico, /vista.svg, etc.
  copyDirectoryRecursive(path.join(cwd, 'public'), vercelStaticDir);

  // Vista static artifacts: /static/pages, /static/chunks, etc.
  copyDirectoryRecursive(path.join(vistaDir, 'static'), path.join(vercelStaticDir, 'static'));

  // Global CSS alias support (/styles.css and /client.css)
  const clientCssPath = path.join(vistaDir, 'client.css');
  copyFileIfPresent(clientCssPath, path.join(vercelStaticDir, 'client.css'));
  copyFileIfPresent(clientCssPath, path.join(vercelStaticDir, 'styles.css'));

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

  fs.writeFileSync(path.join(vercelOutputDir, 'config.json'), JSON.stringify(config, null, 2));

  if (debug) {
    console.log('[vista:deploy] Generated internal Vercel Build Output at .vercel/output/');
  }
}

export function generateDeploymentOutputs(options: DeployOutputOptions): void {
  const { cwd, vistaDir, debug } = options;
  const targetAdapter = options.adapter || process.env.VISTA_ADAPTER;

  // Always generate node standalone build helper
  nodeAdapter.build({ cwd, vistaDir, debug });

  if (targetAdapter) {
    const custom = getAdapter(targetAdapter);
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
    cloudflareAdapter.build({ cwd, vistaDir, debug });
  }

  if (process.env.RENDER === 'true' || targetAdapter === 'render') {
    renderAdapter.build({ cwd, vistaDir, debug });
  }

  if (targetAdapter === 'docker') {
    dockerAdapter.build({ cwd, vistaDir, debug });
  }
}
