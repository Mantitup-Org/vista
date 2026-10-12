import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { getAppConfig } from '../config.js';
import { getBuildInfo } from '../build.js';
import { getLogger } from '../logger.js';
import { getProjectRoot } from '../utils.js';

const logger = getLogger('deploy:cloudflare');

export async function deployCloudflare(
  targetDir: string,
  options: { dryRun?: boolean; force?: boolean; type?: 'pages' | 'workers' },
) {
  const { dryRun, force } = options;
  const appConfig = await getAppConfig();
  const buildInfo = await getBuildInfo();
  const projectRoot = getProjectRoot();

  const outputDir = join(targetDir, '.vista', 'deploy', 'cloudflare');
  const staticDir = join(projectRoot, buildInfo.outputDir, 'static');
  const serverDir = join(projectRoot, buildInfo.outputDir, 'standalone');

  if (dryRun) {
    logger.info(`Dry run: Cloudflare deployment to ${outputDir}`);
  } else {
    await mkdir(outputDir, { recursive: true });
  }

  const deployType = options.type || 'pages'; // Default to 'pages'

  if (deployType === 'pages') {
    logger.info('Generating Cloudflare Pages deployment files...');

    // Copy static assets
    logger.info(`Copying static assets from ${staticDir} to ${outputDir}`);
    if (!dryRun) {
      await copyDir(staticDir, outputDir);
    }

    // Generate _redirects file for Cloudflare Pages
    // This is crucial for handling RSC requests correctly and preventing full reloads.
    // It ensures /rsc/* paths are not rewritten to HTML and are served directly.
    const redirectsContent = `
# Vista-specific redirects for Cloudflare Pages
# Ensure /rsc/* paths are served directly as Flight payloads
/rsc/* /rsc/:splat 200

# Fallback for client-side routing (if not handled by static assets)
# This ensures all non-static paths are routed to index.html for SPA behavior
# (Only if the path doesn't exist as a static file)
/* /index.html 200
`;
    const redirectsPath = join(outputDir, '_redirects');
    logger.info(`Generating _redirects file at ${redirectsPath}`);
    if (!dryRun) {
      await writeFile(redirectsPath, redirectsContent.trim());
    }

    // Cloudflare Pages typically serves `index.html` for all routes not found as static assets.
    // We need to ensure the root `index.html` is present.
    const indexHtmlPath = join(projectRoot, buildInfo.outputDir, 'index.html');
    if (existsSync(indexHtmlPath)) {
      logger.info(`Copying index.html to ${outputDir}`);
      if (!dryRun) {
        await copyFile(indexHtmlPath, join(outputDir, 'index.html'));
      }
    } else {
      logger.warn(`index.html not found at ${indexHtmlPath}. This might cause issues for Cloudflare Pages.`);
    }

    logger.info('Cloudflare Pages deployment files generated successfully.');
    logger.info('To deploy: `npx wrangler pages deploy <outputDir>`');
    logger.info(`Output directory: ${outputDir}`);
  } else if (deployType === 'workers') {
    logger.info('Generating Cloudflare Workers deployment files...');

    // Copy server bundle
    logger.info(`Copying server bundle from ${serverDir} to ${outputDir}`);
    if (!dryRun) {
      await copyDir(serverDir, outputDir);
    }

    // Generate wrangler.toml
    const wranglerTomlContent = `
name = "${appConfig.name || 'vista-app'}-worker"
main = "server.js"
compatibility_date = "2023-12-01" # Adjust as needed
`;
    const wranglerTomlPath = join(outputDir, 'wrangler.toml');
    logger.info(`Generating wrangler.toml at ${wranglerTomlPath}`);
    if (!dryRun) {
      await writeFile(wranglerTomlPath, wranglerTomlContent.trim());
    }

    // Copy static assets into a 'public' folder within the worker bundle if needed
    // For Workers, static assets are usually served by the worker itself or a separate R2 bucket.
    // For simplicity, we'll assume the worker serves them from its own bundle for now.
    const workerPublicDir = join(outputDir, 'public');
    logger.info(`Copying static assets from ${staticDir} to ${workerPublicDir}`);
    if (!dryRun) {
      await copyDir(staticDir, workerPublicDir);
    }

    logger.info('Cloudflare Workers deployment files generated successfully.');
    logger.info('To deploy: `npx wrangler deploy <outputDir>`');
    logger.info(`Output directory: ${outputDir}`);
  } else {
    logger.error(`Unknown Cloudflare deployment type: ${deployType}`);
  }
}

// Helper to copy directories recursively
async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

// Re-export for main deploy command
export { deployCloudflare as cloudflare };

// Add readdir for copyDir helper
import { readdir } from 'node:fs/promises';
