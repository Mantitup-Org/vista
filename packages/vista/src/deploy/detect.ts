import fs from 'fs';
import path from 'path';
import type { DeployTarget, ResolvedDeployConfig, VistaConfig } from '../config';
import { inferDeployOutputForTarget } from '../config';
import type { ResolvedDeployTarget } from './types';

const PLATFORM_FILES: Array<{ target: ResolvedDeployTarget; file: string }> = [
  { target: 'render', file: 'render.yaml' },
  { target: 'vercel', file: 'vercel.json' },
  { target: 'cloudflare', file: 'wrangler.toml' },
  { target: 'netlify', file: 'netlify.toml' },
  { target: 'docker', file: 'Dockerfile' },
];

function detectFromEnv(): ResolvedDeployTarget | null {
  if (process.env.VERCEL === '1' || process.env.NOW_REGION) return 'vercel';
  if (process.env.CF_PAGES === '1' || process.env.CLOUDFLARE_PAGES) return 'cloudflare';
  if (process.env.RENDER === 'true' || process.env.RENDER_SERVICE_ID) return 'render';
  if (process.env.NETLIFY === 'true' || process.env.NETLIFY_SITE_ID) return 'netlify';
  return null;
}

function detectFromProjectFiles(cwd: string): ResolvedDeployTarget | null {
  for (const entry of PLATFORM_FILES) {
    if (fs.existsSync(path.join(cwd, entry.file))) {
      return entry.target;
    }
  }
  return null;
}

export function normalizeResolvedTarget(raw: unknown): ResolvedDeployTarget | null {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (
    value === 'render' ||
    value === 'vercel' ||
    value === 'cloudflare' ||
    value === 'netlify' ||
    value === 'docker'
  ) {
    return value;
  }
  return null;
}

export function resolveDeployTarget(
  cwd: string,
  deployConfig: ResolvedDeployConfig,
  cliTarget?: string | null
): ResolvedDeployTarget {
  const explicitCli = normalizeResolvedTarget(cliTarget);
  if (explicitCli) return explicitCli;

  if (deployConfig.target !== 'auto') {
    const fromConfig = normalizeResolvedTarget(deployConfig.target);
    if (fromConfig) return fromConfig;
  }

  const fromEnv = detectFromEnv();
  if (fromEnv) return fromEnv;

  const fromFiles = detectFromProjectFiles(cwd);
  if (fromFiles) return fromFiles;

  throw new Error(
    '[vista:deploy] Unable to detect deployment target. Pass --target <render|vercel|cloudflare|netlify|docker> or set deploy.target in vista.config.ts.'
  );
}

export function resolveEffectiveOutput(
  deployConfig: ResolvedDeployConfig,
  target: ResolvedDeployTarget
): 'standalone' | 'static' | 'hybrid' {
  if (deployConfig.output !== 'standalone') {
    return deployConfig.output;
  }
  return inferDeployOutputForTarget(target);
}

export function listKnownTargets(): DeployTarget[] {
  return ['auto', 'render', 'vercel', 'cloudflare', 'netlify', 'docker'];
}
