import fs from 'fs';
import path from 'path';

import { extractDeploymentUrl, isCliAvailable, runCliCommand } from '../cli-runner';
import { runStaticHostPreflight, splitPreflightMessages } from '../preflight';
import type { BuildHookOptions, DeployAdapter, DeployContext, DeployResult } from '../types';
import {
  STATIC_HOST_ROUTE_RULES,
  copyStaticHostAssets,
  ensureDir,
  writeFileIfAllowed,
} from '../utils';

export function isVercelBuildEnvironment(): boolean {
  return process.env.VERCEL === '1' || process.env.NOW_REGION !== undefined;
}

export function hasUserVercelConfig(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'vercel.json'));
}

export function writeVercelBuildOutput(options: BuildHookOptions & { force?: boolean }): boolean {
  const { cwd, vistaDir, debug, force = false } = options;

  if (!force && !isVercelBuildEnvironment()) {
    return false;
  }

  if (!force && hasUserVercelConfig(cwd)) {
    if (debug) {
      console.log('[vista:deploy] Found custom vercel.json, skipping internal Vercel output.');
    }
    return false;
  }

  const vercelOutputDir = path.join(cwd, '.vercel', 'output');
  const vercelStaticDir = path.join(vercelOutputDir, 'static');

  fs.rmSync(vercelOutputDir, { recursive: true, force: true });
  ensureDir(vercelStaticDir);

  copyStaticHostAssets(cwd, vistaDir, vercelStaticDir);

  const config = {
    version: 3,
    routes: STATIC_HOST_ROUTE_RULES,
  };

  fs.writeFileSync(path.join(vercelOutputDir, 'config.json'), JSON.stringify(config, null, 2));

  if (debug) {
    console.log('[vista:deploy] Generated internal Vercel Build Output at .vercel/output/');
  }

  return true;
}

function writeLegacyVercelJson(ctx: DeployContext): string | null {
  const targetFile = path.join(ctx.cwd, 'vercel.json');
  const payload = {
    version: 2,
    buildCommand: 'npm run build',
    outputDirectory: '.vista',
    framework: null,
    installCommand: 'npm install --legacy-peer-deps --no-audit --no-fund',
    devCommand: 'npm run dev',
    routes: STATIC_HOST_ROUTE_RULES,
  };

  const result = writeFileIfAllowed(targetFile, `${JSON.stringify(payload, null, 2)}\n`, ctx.force);
  return result.written || result.skipped ? targetFile : null;
}

export const vercelAdapter: DeployAdapter = {
  id: 'vercel',
  requiredOutput: 'static',
  supportsFullRuntime: false,

  async preflight(ctx) {
    return runStaticHostPreflight(ctx);
  },

  async emit(ctx) {
    const artifactPaths: string[] = [];
    const warnings: string[] = [];

    if (ctx.deployConfig.preferBuildOutputApi) {
      const wrote = writeVercelBuildOutput({
        cwd: ctx.cwd,
        vistaDir: ctx.vistaDir,
        debug: ctx.debug,
        force: true,
      });
      if (wrote) {
        artifactPaths.push(path.join(ctx.cwd, '.vercel', 'output'));
      }
    } else if (!hasUserVercelConfig(ctx.cwd) || ctx.force) {
      const legacyPath = writeLegacyVercelJson(ctx);
      if (legacyPath) artifactPaths.push(legacyPath);
    } else {
      artifactPaths.push(path.join(ctx.cwd, 'vercel.json'));
    }

    copyStaticHostAssets(ctx.cwd, ctx.vistaDir, path.join(ctx.vistaDir));
    artifactPaths.push(path.join(ctx.vistaDir, 'static'));

    return {
      status: 'emitted',
      target: 'vercel',
      artifactPaths,
      warnings,
      instructions: [
        'Vercel deploy uses pre-rendered static pages from .vista/static.',
        'For full SSR, server actions, and typed API, deploy with --target render or --target docker.',
      ],
    };
  },

  async deploy(ctx) {
    const emitted = await vercelAdapter.emit(ctx);
    if (ctx.dryRun) {
      return emitted;
    }

    const preflightMessages = await vercelAdapter.preflight(ctx);
    const { errors, warnings } = splitPreflightMessages(preflightMessages);
    if (errors.length > 0) {
      return {
        status: 'failed',
        target: 'vercel',
        warnings: [...warnings, ...errors],
      };
    }

    const hasBuildOutput = fs.existsSync(path.join(ctx.cwd, '.vercel', 'output', 'config.json'));
    const command = hasBuildOutput
      ? ctx.prod
        ? 'vercel deploy --prebuilt --prod --yes'
        : 'vercel deploy --prebuilt --yes'
      : ctx.prod
        ? 'vercel deploy --prod --yes'
        : 'vercel deploy --yes';

    if (!isCliAvailable('vercel')) {
      return {
        status: 'emitted',
        target: 'vercel',
        artifactPaths: emitted.artifactPaths,
        warnings: [
          ...warnings,
          ...(emitted.warnings ?? []),
          'Vercel CLI not found. Install with: npm i -g vercel',
        ],
        instructions: [
          'Install Vercel CLI: npm i -g vercel',
          'Then run: vercel deploy --prod',
          'Or connect this repository in the Vercel dashboard with buildCommand "npm run build".',
        ],
      };
    }

    const result = runCliCommand(command, { cwd: ctx.cwd, dryRun: ctx.dryRun });
    if (!result.ok) {
      return {
        status: 'emitted',
        target: 'vercel',
        artifactPaths: emitted.artifactPaths,
        warnings: [...warnings, result.stderr || 'Vercel deploy failed.'],
        instructions: [
          'Ensure you are logged in: vercel login',
          'Or set VERCEL_TOKEN in your environment.',
          'You can also deploy from the Vercel dashboard using npm run build.',
        ],
      };
    }

    return {
      status: 'deployed',
      target: 'vercel',
      url: extractDeploymentUrl(`${result.stdout}\n${result.stderr}`),
      artifactPaths: emitted.artifactPaths,
      warnings,
    };
  },
};
