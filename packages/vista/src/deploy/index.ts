import path from 'path';

import { BUILD_DIR } from '../constants';
import { loadConfig, resolveDeployConfig } from '../config';
import { getDeployAdapter } from './adapters';
import { resolveDeployTarget } from './detect';
import { splitPreflightMessages, validateBuildArtifacts } from './preflight';
import type { DeployContext, DeployResult } from './types';

export { writeVercelBuildOutput, isVercelBuildEnvironment, hasUserVercelConfig } from './adapters/vercel';
export { resolveDeployTarget, listKnownTargets } from './detect';
export type { DeployContext, DeployResult, DeployAdapter, ResolvedDeployTarget } from './types';

export interface RunDeployOptions {
  cwd?: string;
  target?: string | null;
  dryRun?: boolean;
  skipBuild?: boolean;
  prod?: boolean;
  preview?: boolean;
  force?: boolean;
  debug?: boolean;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  build?: (cwd: string) => Promise<void>;
}

function createContext(options: RunDeployOptions): DeployContext {
  const cwd = options.cwd ?? process.cwd();
  const config = loadConfig(cwd);
  const deployConfig = resolveDeployConfig(config);
  const target = resolveDeployTarget(cwd, deployConfig, options.target ?? null);

  return {
    cwd,
    vistaDir: path.join(cwd, BUILD_DIR),
    config,
    deployConfig,
    target,
    dryRun: Boolean(options.dryRun),
    skipBuild: Boolean(options.skipBuild),
    prod: options.preview ? false : options.prod !== false,
    preview: Boolean(options.preview),
    force: Boolean(options.force),
    debug: options.debug,
    log: options.log,
    warn: options.warn,
    error: options.error,
  };
}

function printResult(ctx: DeployContext, result: DeployResult): void {
  const log = ctx.log ?? console.log;
  const warn = ctx.warn ?? console.warn;

  log('');
  log(`[vista:deploy] Target: ${result.target}`);
  log(`[vista:deploy] Status: ${result.status}`);

  if (result.url) {
    log(`[vista:deploy] URL: ${result.url}`);
  }

  if (result.artifactPaths?.length) {
    log('[vista:deploy] Artifacts:');
    for (const artifact of result.artifactPaths) {
      log(`  - ${artifact}`);
    }
  }

  if (result.warnings?.length) {
    for (const message of result.warnings) {
      warn(`[vista:deploy] Warning: ${message}`);
    }
  }

  if (result.instructions?.length) {
    log('[vista:deploy] Next steps:');
    for (const instruction of result.instructions) {
      log(`  - ${instruction}`);
    }
  }
  log('');
}

export async function runDeploy(options: RunDeployOptions = {}): Promise<DeployResult> {
  const ctx = createContext(options);
  const adapter = getDeployAdapter(ctx.target);
  const log = ctx.log ?? console.log;
  const error = ctx.error ?? console.error;

  if (!options.skipBuild) {
    if (options.build) {
      log('[vista:deploy] Running production build...');
      await options.build(ctx.cwd);
    } else {
      error('[vista:deploy] Internal error: build callback is required.');
      return { status: 'failed', target: ctx.target, warnings: ['Missing build callback.'] };
    }
  }

  const artifactErrors = validateBuildArtifacts(ctx);
  if (artifactErrors.length > 0) {
    for (const message of artifactErrors) {
      error(`[vista:deploy] ${message}`);
    }
    return { status: 'failed', target: ctx.target, warnings: artifactErrors };
  }

  const preflightMessages = await adapter.preflight(ctx);
  const { errors, warnings } = splitPreflightMessages(preflightMessages);
  if (errors.length > 0) {
    for (const message of errors) {
      error(`[vista:deploy] ${message}`);
    }
    return { status: 'failed', target: ctx.target, warnings: [...warnings, ...errors] };
  }

  for (const message of warnings) {
    (ctx.warn ?? console.warn)(`[vista:deploy] Warning: ${message}`);
  }

  const result = ctx.dryRun ? await adapter.emit(ctx) : await adapter.deploy(ctx);
  printResult(ctx, result);
  return result;
}

export function generateDeploymentOutputs(options: {
  cwd: string;
  vistaDir: string;
  debug?: boolean;
}): void {
  const { writeVercelBuildOutput } = require('./adapters/vercel') as typeof import('./adapters/vercel');
  writeVercelBuildOutput({ ...options, force: false });
}
