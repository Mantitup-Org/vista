import fs from 'fs';
import path from 'path';

import { extractDeploymentUrl, isCliAvailable, runCliCommand } from '../cli-runner';
import { runStandalonePreflight, runStaticHostPreflight, splitPreflightMessages } from '../preflight';
import {
  isStaticOnlyDeploy,
  writeCloudflareContainerWorker,
  writeCloudflareFullRuntimeToml,
} from '../runtime-pack';
import type { DeployAdapter, DeployContext } from '../types';
import { copyStaticHostAssets, ensureDir, prepareStaticCdnOutput, writeFileIfAllowed } from '../utils';
import { DOCKERFILE_TEMPLATE } from './docker';

const CLOUDFLARE_OUTPUT_DIR = '.vista/deploy/cloudflare';

function getCloudflareOutputDir(ctx: DeployContext): string {
  return path.join(ctx.cwd, CLOUDFLARE_OUTPUT_DIR);
}

export const cloudflareAdapter: DeployAdapter = {
  id: 'cloudflare',
  requiredOutput: 'standalone',
  supportsFullRuntime: true,

  async preflight(ctx) {
    if (isStaticOnlyDeploy(ctx)) {
      return runStaticHostPreflight(ctx);
    }
    return runStandalonePreflight(ctx);
  },

  async emit(ctx) {
    const outputDir = getCloudflareOutputDir(ctx);
    fs.rmSync(outputDir, { recursive: true, force: true });
    ensureDir(outputDir);

    if (isStaticOnlyDeploy(ctx)) {
      copyStaticHostAssets(ctx.cwd, ctx.vistaDir, outputDir);
      prepareStaticCdnOutput(outputDir);
      return {
        status: 'emitted',
        target: 'cloudflare',
        artifactPaths: [outputDir],
        instructions: [
          'Static mode: Cloudflare Pages serves pre-rendered output.',
          'For Flight SSR, omit deploy.output "static" and use Cloudflare Containers.',
        ],
      };
    }

    copyStaticHostAssets(ctx.cwd, ctx.vistaDir, outputDir);
    writeCloudflareContainerWorker(outputDir);
    const wranglerPath = writeCloudflareFullRuntimeToml(ctx);
    const dockerfilePath = path.join(ctx.cwd, 'Dockerfile');
    writeFileIfAllowed(dockerfilePath, DOCKERFILE_TEMPLATE, ctx.force);

    return {
      status: 'emitted',
      target: 'cloudflare',
      artifactPaths: [outputDir, wranglerPath, dockerfilePath],
      instructions: [
        'Cloudflare Workers cannot spawn Vista’s Node Flight process.',
        'Full SSR uses Cloudflare Containers (same Dockerfile as docker deploy).',
        'Run: npx wrangler login && npx wrangler deploy --prod',
        'Or build/run the Dockerfile on any Node host (Fly, Railway, Render).',
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
    const staticOnly = isStaticOnlyDeploy(ctx);
    const wranglerCommand = staticOnly
      ? `wrangler pages deploy "${outputDir}" --project-name my-vista-app${ctx.prod ? '' : ' --branch preview'}`
      : ctx.prod
        ? 'wrangler deploy --prod'
        : 'wrangler deploy';

    if (!isCliAvailable('wrangler')) {
      return {
        status: 'emitted',
        target: 'cloudflare',
        artifactPaths: emitted.artifactPaths,
        warnings: [...warnings, 'Wrangler CLI not found. Install with: npm i -g wrangler'],
        instructions: emitted.instructions,
      };
    }

    const result = runCliCommand(wranglerCommand, { cwd: ctx.cwd, dryRun: ctx.dryRun });
    if (!result.ok) {
      return {
        status: 'emitted',
        target: 'cloudflare',
        artifactPaths: emitted.artifactPaths,
        warnings: [...warnings, result.stderr || 'Wrangler deploy failed.'],
        instructions: [
          'Run: wrangler login',
          'Or set CLOUDFLARE_API_TOKEN.',
          ...(staticOnly ? [] : ['If Containers are unavailable, deploy the Dockerfile to Fly/Railway/Render.']),
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
