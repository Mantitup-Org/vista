import fs from 'fs';
import path from 'path';

import { extractDeploymentUrl, isCliAvailable, runCliCommand } from '../cli-runner';
import { runStandalonePreflight, runStaticHostPreflight, splitPreflightMessages } from '../preflight';
import { isStaticOnlyDeploy, packVercelFullRuntime } from '../runtime-pack';
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

/**
 * Build Output v3 route rules for static-only deploys.
 *
 * `copyStaticHostAssets` nests the vista `static/` directory under
 * `.vercel/output/static/static/` (and a mirror at `_vista/static/`).
 * The generic `STATIC_HOST_ROUTE_RULES` use `/static/pages/…` destinations
 * which are correct for `vercel.json` (where `outputDirectory` is `.vista`)
 * but WRONG for Build Output v3, where dest paths are relative to
 * `.vercel/output/` and the files actually live under `/static/static/`.
 * Using the generic rules produces 404s for every HTML page and RSC payload.
 */
const BUILD_OUTPUT_STATIC_ROUTES = [
  { handle: 'filesystem' as const },
  {
    src: '^/_vista/static/(.*)$',
    headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    dest: '/static/_vista/static/$1',
  },
  { src: '^/(?:rsc|_rsc)/?$', dest: '/static/static/pages/index.rsc' },
  { src: '^/(?:rsc|_rsc)/(.+)$', dest: '/static/static/pages/$1.rsc' },
  { src: '^/$', dest: '/static/static/pages/index.html' },
  { src: '^/(.+)$', dest: '/static/static/pages/$1.html' },
];

export function writeVercelBuildOutput(options: BuildHookOptions & { force?: boolean }): boolean {
  const { cwd, vistaDir, debug, force = false } = options;

  if (!force && !isVercelBuildEnvironment()) {
    return false;
  }

  const standaloneServer = path.join(vistaDir, 'standalone', 'server.js');
  const staticOnly = !fs.existsSync(standaloneServer);

  if (staticOnly) {
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
    fs.writeFileSync(
      path.join(vercelOutputDir, 'config.json'),
      JSON.stringify({ version: 3, routes: BUILD_OUTPUT_STATIC_ROUTES }, null, 2)
    );
    return true;
  }

  packVercelFullRuntime({
    cwd,
    vistaDir,
    config: {},
    deployConfig: {
      target: 'vercel',
      output: 'standalone',
      prod: true,
      preferBuildOutputApi: true,
    },
    target: 'vercel',
    dryRun: true,
    skipBuild: true,
    prod: true,
    preview: false,
    force: true,
    debug,
  } as DeployContext);

  if (debug) {
    console.log('[vista:deploy] Generated Vercel Node SSR output at .vercel/output/');
  }
  return true;
}

function writeVercelJson(ctx: DeployContext, fullRuntime: boolean): string | null {
  const targetFile = path.join(ctx.cwd, 'vercel.json');
  const payload = fullRuntime
    ? {
        version: 2,
        buildCommand: 'npm run build',
        installCommand: 'npm install --legacy-peer-deps --no-audit --no-fund',
        framework: null,
      }
    : {
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
  requiredOutput: 'standalone',
  supportsFullRuntime: true,

  async preflight(ctx) {
    if (isStaticOnlyDeploy(ctx)) {
      return runStaticHostPreflight(ctx);
    }
    return runStandalonePreflight(ctx);
  },

  async emit(ctx) {
    const artifactPaths: string[] = [];
    const warnings: string[] = [];
    const staticOnly = isStaticOnlyDeploy(ctx);

    if (staticOnly) {
      const wrote = writeVercelBuildOutput({
        cwd: ctx.cwd,
        vistaDir: ctx.vistaDir,
        debug: ctx.debug,
        force: true,
      });
      if (wrote) artifactPaths.push(path.join(ctx.cwd, '.vercel', 'output'));
      artifactPaths.push(path.join(ctx.vistaDir, 'static'));
    } else {
      artifactPaths.push(...packVercelFullRuntime(ctx));
    }

    const vercelJson = writeVercelJson(ctx, !staticOnly);
    if (vercelJson) artifactPaths.push(vercelJson);

    return {
      status: 'emitted',
      target: 'vercel',
      artifactPaths,
      warnings,
      instructions: staticOnly
        ? [
            'Static mode: Vercel serves pre-rendered pages from .vista/static.',
            'For Flight SSR, omit deploy.output "static" (default is standalone).',
          ]
        : [
            'Vercel Build Output includes a Node.js serverless function that runs Flight SSR.',
            'Deploy with: vercel deploy --prebuilt --prod',
            'Connect the Git repo on Vercel; build command is "npm run build".',
            'Cold start spawns the Flight upstream in-process. Raise maxDuration in .vc-config.json if pages are slow.',
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
          'Then run: vercel login && vercel deploy --prebuilt --prod',
          'Or import the Git repository in the Vercel dashboard (build: npm run build).',
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
        instructions: ['Ensure you are logged in: vercel login', 'Or set VERCEL_TOKEN.'],
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
