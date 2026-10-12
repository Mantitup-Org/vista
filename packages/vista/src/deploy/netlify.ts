import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { execa } from 'execa'; // For bundling server.js

import { getAppConfig } from '../config.js';
import { getBuildInfo } from '../build.js';
import { getLogger } from '../logger.js';
import { getProjectRoot } from '../utils.js';

const logger = getLogger('deploy:netlify');

export async function deployNetlify(
  targetDir: string,
  options: { dryRun?: boolean; force?: boolean },
) {
  const { dryRun } = options;
  const appConfig = await getAppConfig();
  const buildInfo = await getBuildInfo();
  const projectRoot = getProjectRoot();

  const outputDir = join(targetDir, '.vista', 'deploy', 'netlify');
  const staticDir = join(projectRoot, buildInfo.outputDir, 'static');
  const serverEntry = join(projectRoot, buildInfo.outputDir, 'standalone', 'server.js');

  if (dryRun) {
    logger.info(`Dry run: Netlify deployment to ${outputDir}`);
  } else {
    await mkdir(outputDir, { recursive: true });
  }

  logger.info('Generating Netlify deployment files...');

  // Netlify output structure:
  // <outputDir>/ -> static assets
  // <outputDir>/_redirects -> redirects file
  // <outputDir>/netlify/functions/ -> serverless functions
  const netlifyFunctionsDir = join(outputDir, 'netlify', 'functions');

  // 1. Copy static assets directly to the outputDir
  logger.info(`Copying static assets from ${staticDir} to ${outputDir}`);
  if (!dryRun) {
    await copyDir(staticDir, outputDir);
  }

  // 2. Generate _redirects file
  // This is crucial for handling RSC requests correctly and preventing full reloads.
  // It ensures /rsc/* paths are not rewritten to HTML and are served directly.
  // Also includes a fallback for client-side routing.
  const redirectsContent = `
# Vista-specific redirects for Netlify
# Ensure /rsc/* paths are served directly as Flight payloads
/rsc/* /.netlify/functions/server 200

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

  // 3. Bundle serverless function
  logger.info(`Bundling serverless function from ${serverEntry} to ${netlifyFunctionsDir}`);
  if (!existsSync(serverEntry)) {
    logger.error(`Server entry point not found: ${serverEntry}. Please ensure 'npm run build' was successful.`);
    throw new Error('Server entry point missing for Netlify deployment.');
  }

  if (!dryRun) {
    await mkdir(netlifyFunctionsDir, { recursive: true });

    // Use ncc to bundle the server.js and its node_modules into a single file
    // This is crucial for Netlify's serverless function environment.
    logger.info('Using `ncc` to bundle server.js...');
    try {
      await execa('npx', ['ncc', 'build', serverEntry, '-o', netlifyFunctionsDir, '-m', '--target', 'es2020', '--no-cache'], {
        cwd: projectRoot,
        stdio: 'inherit',
      });
      // ncc outputs index.js by default, rename it to server.js for clarity and consistency
      await copyFile(join(netlifyFunctionsDir, 'index.js'), join(netlifyFunctionsDir, 'server.js'));
      await rm(join(netlifyFunctionsDir, 'index.js'));
    } catch (error) {
      logger.error(`Failed to bundle server.js with ncc: ${error}`);
      throw error;
    }
  }

  logger.info('Netlify deployment files generated successfully.');
  logger.info('To deploy: `npx netlify deploy --dir=<outputDir>`');
  logger.info(`Output directory: ${outputDir}`);
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
export { deployNetlify as netlify };

// Add readdir and rm for copyDir helper and ncc cleanup
import { readdir, rm } from 'node:fs/promises';
