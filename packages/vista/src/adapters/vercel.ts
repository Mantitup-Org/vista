import fs from 'fs';
import path from 'path';
import type { DeploymentAdapter, DeploymentContext } from './types';

function copyDirectoryRecursive(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const from = path.join(sourceDir, entry.name);
    const to = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

export const vercelAdapter: DeploymentAdapter = {
  name: 'vercel',
  description: 'Vercel Serverless and Build Output API v3 adapter',
  build(context: DeploymentContext): void {
    const { cwd, vistaDir, debug } = context;
    const vercelOutputDir = path.join(cwd, '.vercel', 'output');
    const vercelStaticDir = path.join(vercelOutputDir, 'static');

    fs.rmSync(vercelOutputDir, { recursive: true, force: true });
    fs.mkdirSync(vercelStaticDir, { recursive: true });

    // Public assets & static output
    copyDirectoryRecursive(path.join(cwd, 'public'), vercelStaticDir);
    copyDirectoryRecursive(path.join(vistaDir, 'static'), path.join(vercelStaticDir, 'static'));

    const clientCssPath = path.join(vistaDir, 'client.css');
    if (fs.existsSync(clientCssPath)) {
      fs.copyFileSync(clientCssPath, path.join(vercelStaticDir, 'client.css'));
      fs.copyFileSync(clientCssPath, path.join(vercelStaticDir, 'styles.css'));
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
      ],
    };

    fs.writeFileSync(path.join(vercelOutputDir, 'config.json'), JSON.stringify(config, null, 2));

    if (debug) {
      console.log('[vista:deploy] Generated Vercel Build Output v3 at .vercel/output/');
    }
  },
};
