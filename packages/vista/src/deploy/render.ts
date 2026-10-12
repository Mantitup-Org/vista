import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { getAppConfig } from '../config.js';
import { getBuildInfo } from '../build.js';
import { getLogger } from '../logger.js';
import { getProjectRoot } from '../utils.js';

const logger = getLogger('deploy:render');

export async function deployRender(
  targetDir: string,
  options: { dryRun?: boolean; force?: boolean },
) {
  const { dryRun } = options;
  const appConfig = await getAppConfig();
  const buildInfo = await getBuildInfo();
  const projectRoot = getProjectRoot();

  const outputDir = join(targetDir, '.vista', 'deploy', 'render');
  const serverDir = join(projectRoot, buildInfo.outputDir, 'standalone');

  if (dryRun) {
    logger.info(`Dry run: Render deployment to ${outputDir}`);
  } else {
    await mkdir(outputDir, { recursive: true });
  }

  logger.info('Generating Render deployment files...');

  // Copy server bundle
  logger.info(`Copying server bundle from ${serverDir} to ${outputDir}`);
  if (!dryRun) {
    await copyDir(serverDir, outputDir);
  }

  // Generate render.yaml
  const renderYamlContent = `
# Render.com configuration for Vista application
services:
  - type: web
    name: ${appConfig.name || 'vista-app'}
    env: node
    plan: starter # or 'standard'
    buildCommand: npm install && npm run build # Assuming build is done before deploy, or can be run here
    startCommand: node .vista/standalone/server.js # Corrected start command
    healthCheckPath: /
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000 # Render's default port
`;
  const renderYamlPath = join(outputDir, 'render.yaml');
  logger.info(`Generating render.yaml at ${renderYamlPath}`);
  if (!dryRun) {
    await writeFile(renderYamlPath, renderYamlContent.trim());
  }

  logger.info('Render deployment files generated successfully.');
  logger.info('To deploy: Commit these files to a Git repository connected to Render.com.');
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
export { deployRender as render };

// Add readdir for copyDir helper
import { readdir } from 'node:fs/promises';
