import fs from 'fs';
import path from 'path';

import { extractDeploymentUrl, isCliAvailable, runCliCommand } from '../cli-runner';
import { runStandalonePreflight, runStaticHostPreflight, splitPreflightMessages } from '../preflight';
import { isStaticOnlyDeploy, packRuntimeNodeModules, writeNetlifySsrHandler } from '../runtime-pack';
import type { DeployAdapter } from '../types';
import { copyDirectoryRecursive, copyStaticHostAssets, ensureDir, writeFileIfAllowed } from '../utils';

const NETLIFY_OUTPUT_DIR = '.vista/deploy/netlify';

function getNetlifyOutputDir(ctx: { cwd: string }): string {
  return path.join(ctx.cwd, NETLIFY_OUTPUT_DIR);
}

function writeStaticNetlifyToml(ctx: { cwd: string; force: boolean }): string {
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

function writeFullRuntimeNetlifyToml(ctx: { cwd: string; force: boolean }): string {
  const targetFile = path.join(ctx.cwd, 'netlify.toml');
  const content = `[build]
  command = "npm run build"
  publish = ".vista/deploy/netlify"
  functions = "netlify/functions"

[functions]
  node_bundler = "none"
  included_files = ["netlify/functions/.vista/**", "netlify/functions/node_modules/**"]

[dev]
  command = "npm run dev"
  port = 3003

[[redirects]]
  from = "/_vista/*"
  to = "/_vista/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/.netlify/functions/ssr"
  status = 200
`;
  writeFileIfAllowed(targetFile, content, ctx.force);
  return targetFile;
}

function writeStaticRedirects(outputDir: string): string {
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
  requiredOutput: 'standalone',
  supportsFullRuntime: true,

  async preflight(ctx) {
    if (isStaticOnlyDeploy(ctx)) {
      return runStaticHostPreflight(ctx);
    }
    return runStandalonePreflight(ctx);
  },

  async emit(ctx) {
    const outputDir = getNetlifyOutputDir(ctx);
    fs.rmSync(outputDir, { recursive: true, force: true });
    ensureDir(outputDir);

    if (isStaticOnlyDeploy(ctx)) {
      copyStaticHostAssets(ctx.cwd, ctx.vistaDir, outputDir);
      const redirectsPath = writeStaticRedirects(outputDir);
      const netlifyTomlPath = writeStaticNetlifyToml(ctx);
      return {
        status: 'emitted',
        target: 'netlify',
        artifactPaths: [outputDir, redirectsPath, netlifyTomlPath],
        instructions: ['Static mode: Netlify serves pre-rendered pages only.'],
      };
    }

    copyStaticHostAssets(ctx.cwd, ctx.vistaDir, outputDir);
    copyDirectoryRecursive(
      path.join(ctx.vistaDir, 'static'),
      path.join(outputDir, '_vista', 'static')
    );

    const functionDir = path.join(ctx.cwd, 'netlify', 'functions');
    fs.rmSync(functionDir, { recursive: true, force: true });
    writeNetlifySsrHandler(functionDir);
    copyDirectoryRecursive(ctx.vistaDir, path.join(functionDir, '.vista'));
    packRuntimeNodeModules(ctx.cwd, functionDir);
    const netlifyTomlPath = writeFullRuntimeNetlifyToml(ctx);

    return {
      status: 'emitted',
      target: 'netlify',
      artifactPaths: [outputDir, functionDir, netlifyTomlPath],
      instructions: [
        'Netlify Functions run the Vista Flight SSR server.',
        'Deploy with: netlify deploy --prod --dir=".vista/deploy/netlify" --functions="netlify/functions"',
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

    if (!isCliAvailable('netlify')) {
      return {
        status: 'emitted',
        target: 'netlify',
        artifactPaths: emitted.artifactPaths,
        warnings: [...warnings, 'Netlify CLI not found. Install with: npm i -g netlify-cli'],
        instructions: [
          'Install Netlify CLI: npm i -g netlify-cli',
          'Then run: netlify deploy --prod --dir=".vista/deploy/netlify" --functions="netlify/functions"',
        ],
      };
    }

    const command = ctx.prod
      ? 'netlify deploy --prod --dir=".vista/deploy/netlify" --functions="netlify/functions"'
      : 'netlify deploy --dir=".vista/deploy/netlify" --functions="netlify/functions"';
    const result = runCliCommand(command, { cwd: ctx.cwd, dryRun: ctx.dryRun });
    if (!result.ok) {
      return {
        status: 'emitted',
        target: 'netlify',
        artifactPaths: emitted.artifactPaths,
        warnings: [...warnings, result.stderr || 'Netlify deploy failed.'],
        instructions: ['Run: netlify login', 'Or set NETLIFY_AUTH_TOKEN.'],
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
