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

export const cloudflareAdapter: DeploymentAdapter = {
  target: 'cloudflare',
  name: 'Cloudflare Pages & Workers',

  generate(context: DeploymentContext): DeploymentResult {
    const { cwd, vistaDir, debug, deploymentConfig } = context;
    const generatedFiles: string[] = [];

    const cfOutputDir = deploymentConfig.outDir
      ? path.resolve(cwd, deploymentConfig.outDir)
      : path.join(vistaDir, 'cloudflare');

    fs.rmSync(cfOutputDir, { recursive: true, force: true });
    fs.mkdirSync(cfOutputDir, { recursive: true });

    // 1. Static Public assets
    const publicDir = path.join(cwd, 'public');
    if (fs.existsSync(publicDir)) {
      copyDirectoryRecursive(publicDir, cfOutputDir);
    }

    // 2. Vista static artifacts
    const vistaStaticDir = path.join(vistaDir, 'static');
    if (fs.existsSync(vistaStaticDir)) {
      copyDirectoryRecursive(vistaStaticDir, path.join(cfOutputDir, 'static'));
    }

    // 3. Global CSS assets
    const clientCssPath = path.join(vistaDir, 'client.css');
    copyFileIfPresent(clientCssPath, path.join(cfOutputDir, 'client.css'));
    copyFileIfPresent(clientCssPath, path.join(cfOutputDir, 'styles.css'));

    // 4. _routes.json for Cloudflare Pages
    const routesConfig = {
      version: 1,
      include: ['/*'],
      exclude: ['/static/*', '/favicon.ico', '/vista.svg', '/styles.css', '/client.css'],
    };
    const routesPath = path.join(cfOutputDir, '_routes.json');
    fs.writeFileSync(routesPath, JSON.stringify(routesConfig, null, 2));
    generatedFiles.push(routesPath);

    // 5. _worker.js Edge Worker entrypoint
    const workerCode = [
      'export default {',
      '  async fetch(request, env, ctx) {',
      '    const url = new URL(request.url);',
      '    // First try static assets via env.ASSETS',
      '    if (env.ASSETS) {',
      '      const assetResponse = await env.ASSETS.fetch(request);',
      '      if (assetResponse.status !== 404) {',
      '        return assetResponse;',
      '      }',
      '    }',
      '    return new Response("Vista Edge Handler", {',
      '      status: 200,',
      '      headers: { "Content-Type": "text/html; charset=utf-8" },',
      '    });',
      '  },',
      '};',
      '',
    ].join('\n');

    const workerPath = path.join(cfOutputDir, '_worker.js');
    fs.writeFileSync(workerPath, workerCode);
    generatedFiles.push(workerPath);

    // 6. Optional wrangler.toml blueprint
    if (deploymentConfig.generateBlueprints && !fs.existsSync(path.join(cwd, 'wrangler.toml'))) {
      const blueprintFiles = this.generateBlueprint!(context);
      generatedFiles.push(...blueprintFiles);
    }

    if (debug) {
      console.log(`[vista:deploy:cloudflare] Generated Cloudflare Pages output at ${cfOutputDir}`);
    }

    return {
      target: 'cloudflare',
      success: true,
      outputDirectory: cfOutputDir,
      generatedFiles,
      notes: [
        `Cloudflare Pages output generated at ${cfOutputDir}`,
        '_routes.json configured for static caching',
        '_worker.js created for dynamic edge routing',
      ],
    };
  },

  generateBlueprint(context: DeploymentContext): string[] {
    const { cwd, vistaDir } = context;
    const targetFile = path.join(cwd, 'wrangler.toml');
    if (fs.existsSync(targetFile)) return [];

    const pkgName = (() => {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
        return pkg.name?.replace(/[@/]/g, '-') || 'vista-app';
      } catch {
        return 'vista-app';
      }
    })();

    const wranglerToml = [
      `name = "${pkgName}"`,
      'compatibility_date = "2026-03-01"',
      'compatibility_flags = ["nodejs_compat"]',
      `pages_build_output_dir = "${path.relative(cwd, path.join(vistaDir, 'cloudflare')) || '.vista/cloudflare'}"`,
      '',
    ].join('\n');

    fs.writeFileSync(targetFile, wranglerToml);
    return [targetFile];
  },
};
