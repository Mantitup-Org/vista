import fs from 'fs';
import path from 'path';

import { extractDeploymentUrl, isCliAvailable, runCliCommand } from '../cli-runner';
import { runStaticHostPreflight, splitPreflightMessages } from '../preflight';
import type { DeployAdapter, DeployContext } from '../types';
import { copyStaticHostAssets, ensureDir, writeFileIfAllowed } from '../utils';

const CLOUDFLARE_OUTPUT_DIR = '.vista/deploy/cloudflare';

function getCloudflareOutputDir(ctx: DeployContext): string {
  return path.join(ctx.cwd, CLOUDFLARE_OUTPUT_DIR);
}

function writeWranglerToml(ctx: DeployContext, outputDir: string): string {
  const targetFile = path.join(ctx.cwd, 'wrangler.toml');
  const relativeOutput = path.relative(ctx.cwd, outputDir).replace(/\\/g, '/');
  const content = `name = "my-vista-app"
compatibility_date = "2024-09-01"
pages_build_output_dir = "${relativeOutput}"
`;
  writeFileIfAllowed(targetFile, content, ctx.force);
  return targetFile;
}

function writeRoutesJson(outputDir: string): string {
  const routesPath = path.join(outputDir, '_routes.json');
  const routes = {
    version: 1,
    include: ['/*'],
    exclude: ['/static/*'],
  };
  fs.writeFileSync(routesPath, `${JSON.stringify(routes, null, 2)}\n`, 'utf8');
  return routesPath;
}

function writeRedirects(outputDir: string): string {
  const redirectsPath = path.join(outputDir, '_redirects');
  const lines = [
    '/_vista/* /:splat 200',
    '/ /static/pages/index.html 200',
    '/rsc /static/pages/index.rsc 200',
    '/_rsc/* /static/pages/:splat.rsc 200',
    '/* /static/pages/:splat.html 200',
  ];
  fs.writeFileSync(redirectsPath, `${lines.join('\n')}\n`, 'utf8');
  return redirectsPath;
}

export const cloudflareAdapter: DeployAdapter = {
  id: 'cloudflare',
  requiredOutput: 'static',
  supportsFullRuntime: false,

  async preflight(ctx) {
    return runStaticHostPreflight(ctx);
  },

  async emit(ctx) {
    const outputDir = getCloudflareOutputDir(ctx);
    fs.rmSync(outputDir, { recursive: true, force: true });
    ensureDir(outputDir);

    copyStaticHostAssets(ctx.cwd, ctx.vistaDir, outputDir);
    const routesPath = writeRoutesJson(outputDir);
    const redirectsPath = writeRedirects(outputDir);
    const wranglerPath = writeWranglerToml(ctx, outputDir);

    return {
      status: 'emitted',
      target: 'cloudflare',
      artifactPaths: [outputDir, routesPath, redirectsPath, wranglerPath],
      instructions: [
        'Cloudflare Pages deploy uses pre-rendered static output.',
        'Set images.unoptimized: true when using Vista Image on static hosts.',
      ],
    };
  },

  async deploy(ctx) {
    const emitted = await cloudflareAdapter.emit(ctx);
    if (ctx.dryRun) {
      return emitted;
    }

    const preflightMessages = await cloudflareAdapter.preflight(ctx);
    const { errors, warnings } = splitPreflightMessages(preflightMessages);
    if (errors.length > 0) {
      return {
        status: 'failed',
        target: 'cloudflare',
        warnings: [...warnings, ...errors],
      };
    }

    const outputDir = getCloudflareOutputDir(ctx);
    if (!isCliAvailable('wrangler')) {
      return {
        status: 'emitted',
        target: 'cloudflare',
        artifactPaths: emitted.artifactPaths,
        warnings: [...warnings, 'Wrangler CLI not found. Install with: npm i -g wrangler'],
        instructions: [
          'Install Wrangler: npm i -g wrangler',
          `Then run: wrangler pages deploy "${outputDir}" --project-name my-vista-app`,
          'Or connect the repo in the Cloudflare Pages dashboard.',
        ],
      };
    }

    const branchFlag = ctx.prod ? '' : '--branch preview';
    const command = `wrangler pages deploy "${outputDir}" --project-name my-vista-app ${branchFlag}`.trim();
    const result = runCliCommand(command, { cwd: ctx.cwd, dryRun: ctx.dryRun });
    if (!result.ok) {
      return {
        status: 'emitted',
        target: 'cloudflare',
        artifactPaths: emitted.artifactPaths,
        warnings: [...warnings, result.stderr || 'Wrangler deploy failed.'],
        instructions: [
          'Run: wrangler login',
          'Or set CLOUDFLARE_API_TOKEN in your environment.',
        ],
      };
    }

    return {
      status: 'deployed',
      target: 'cloudflare',
      url: extractDeploymentUrl(`${result.stdout}\n${result.stderr}`),
      artifactPaths: emitted.artifactPaths,
      warnings,
    };
  },
};
