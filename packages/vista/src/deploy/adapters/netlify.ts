import fs from 'fs';
import path from 'path';

import { extractDeploymentUrl, isCliAvailable, runCliCommand } from '../cli-runner';
import { runStaticHostPreflight, splitPreflightMessages } from '../preflight';
import type { DeployAdapter } from '../types';
import { copyStaticHostAssets, ensureDir, writeFileIfAllowed } from '../utils';

const NETLIFY_OUTPUT_DIR = '.vista/deploy/netlify';

function getNetlifyOutputDir(ctx: { cwd: string }): string {
  return path.join(ctx.cwd, NETLIFY_OUTPUT_DIR);
}

function writeNetlifyToml(ctx: { cwd: string; force: boolean }): string {
  const targetFile = path.join(ctx.cwd, 'netlify.toml');
  const content = `[build]
  command = "npm run build"
  publish = ".vista/deploy/netlify"

[dev]
  command = "npm run dev"
  port = 3003
`;
  writeFileIfAllowed(targetFile, content, ctx.force);
  return targetFile;
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

export const netlifyAdapter: DeployAdapter = {
  id: 'netlify',
  requiredOutput: 'static',
  supportsFullRuntime: false,

  async preflight(ctx) {
    return runStaticHostPreflight(ctx);
  },

  async emit(ctx) {
    const outputDir = getNetlifyOutputDir(ctx);
    fs.rmSync(outputDir, { recursive: true, force: true });
    ensureDir(outputDir);

    copyStaticHostAssets(ctx.cwd, ctx.vistaDir, outputDir);
    const redirectsPath = writeRedirects(outputDir);
    const netlifyTomlPath = writeNetlifyToml(ctx);

    return {
      status: 'emitted',
      target: 'netlify',
      artifactPaths: [outputDir, redirectsPath, netlifyTomlPath],
      instructions: [
        'Netlify deploy uses pre-rendered static output from .vista/deploy/netlify.',
      ],
    };
  },

  async deploy(ctx) {
    const emitted = await netlifyAdapter.emit(ctx);
    if (ctx.dryRun) {
      return emitted;
    }

    const preflightMessages = await netlifyAdapter.preflight(ctx);
    const { errors, warnings } = splitPreflightMessages(preflightMessages);
    if (errors.length > 0) {
      return {
        status: 'failed',
        target: 'netlify',
        warnings: [...warnings, ...errors],
      };
    }

    const outputDir = getNetlifyOutputDir(ctx);
    if (!isCliAvailable('netlify')) {
      return {
        status: 'emitted',
        target: 'netlify',
        artifactPaths: emitted.artifactPaths,
        warnings: [...warnings, 'Netlify CLI not found. Install with: npm i -g netlify-cli'],
        instructions: [
          'Install Netlify CLI: npm i -g netlify-cli',
          `Then run: netlify deploy --prod --dir="${outputDir}"`,
        ],
      };
    }

    const command = ctx.prod
      ? `netlify deploy --prod --dir="${outputDir}"`
      : `netlify deploy --dir="${outputDir}"`;
    const result = runCliCommand(command, { cwd: ctx.cwd, dryRun: ctx.dryRun });
    if (!result.ok) {
      return {
        status: 'emitted',
        target: 'netlify',
        artifactPaths: emitted.artifactPaths,
        warnings: [...warnings, result.stderr || 'Netlify deploy failed.'],
        instructions: [
          'Run: netlify login',
          'Or set NETLIFY_AUTH_TOKEN in your environment.',
        ],
      };
    }

    return {
      status: 'deployed',
      target: 'netlify',
      url: extractDeploymentUrl(`${result.stdout}\n${result.stderr}`),
      artifactPaths: emitted.artifactPaths,
      warnings,
    };
  },
};
