import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { execa } from 'execa'; // For bundling server.js

import { getAppConfig } from '../config.js';
import { getBuildInfo } from '../build.js';
import { getLogger } from '../logger.js';
import { getProjectRoot } from '../utils.js';

const logger = getLogger('deploy:vercel');

export async function deployVercel(
  targetDir: string,
  options: { dryRun?: boolean; force?: boolean },
) {
  const { dryRun } = options;
  const appConfig = await getAppConfig();
  const buildInfo = await getBuildInfo();
  const projectRoot = getProjectRoot();

  const outputDir = join(targetDir, '.vista', 'deploy', 'vercel');
  const staticDir = join(projectRoot, buildInfo.outputDir, 'static');
  const serverEntry = join(projectRoot, buildInfo.outputDir, 'standalone', 'server.js');

  if (dryRun) {
    logger.info(`Dry run: Vercel deployment to ${outputDir}`);
  } else {
    await mkdir(outputDir, { recursive: true });
  }

  logger.info('Generating Vercel deployment files...');

  // Vercel output structure:
  // .vercel/output/static/ -> static assets
  // .vercel/output/functions/index.func/ -> serverless function
  const vercelStaticDir = join(outputDir, 'static');
  const vercelFunctionsDir = join(outputDir, 'functions', 'index.func');

  // 1. Copy static assets
  logger.info(`Copying static assets from ${staticDir} to ${vercelStaticDir}`);
  if (!dryRun) {
    await mkdir(vercelStaticDir, { recursive: true });
    await copyDir(staticDir, vercelStaticDir);
  }

  // 2. Bundle serverless function
  logger.info(`Bundling serverless function from ${serverEntry} to ${vercelFunctionsDir}`);
  if (!existsSync(serverEntry)) {
    logger.error(`Server entry point not found: ${serverEntry}. Please ensure 'npm run build' was successful.`);
    throw new Error('Server entry point missing for Vercel deployment.');
  }

  if (!dryRun) {
    await mkdir(vercelFunctionsDir, { recursive: true });

    // Use ncc to bundle the server.js and its node_modules into a single file
    // This is crucial for Vercel's serverless function environment.
    logger.info('Using `ncc` to bundle server.js...');
    try {
      await execa('npx', ['ncc', 'build', serverEntry, '-o', vercelFunctionsDir, '-m', '--target', 'es2020', '--no-cache'], {
        cwd: projectRoot,
        stdio: 'inherit',
      });
      // ncc outputs index.js by default
      await copyFile(join(vercelFunctionsDir, 'index.js'), join(vercelFunctionsDir, 'server.js'));
      // Remove the ncc default index.js
      await rm(join(vercelFunctionsDir, 'index.js'));
    } catch (error) {
      logger.error(`Failed to bundle server.js with ncc: ${error}`);
      throw error;
    }

    // Create a config.json for the function
    const configJsonPath = join(vercelFunctionsDir, 'config.json');
    const configContent = {
      runtime: 'nodejs18.x', // Or nodejs20.x, depending on Vercel's latest support
      handler: 'server.js',
      maxDuration: 10, // Default max duration
      memory: 1024, // Default memory
    };
    logger.info(`Generating config.json for function at ${configJsonPath}`);
    await writeFile(configJsonPath, JSON.stringify(configContent, null, 2));
  }

  logger.info('Vercel deployment files generated successfully.');
  logger.info('To deploy: `npx vercel deploy <outputDir>`');
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
export { deployVercel as vercel };

// Add readdir and rm for copyDir helper and ncc cleanup
import { readdir, rm } from 'node:fs/promises';
