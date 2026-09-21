import fs from 'fs';
import path from 'path';

import { extractDeploymentUrl, isCliAvailable, runCliCommand } from '../cli-runner';
import { runStandalonePreflight } from '../preflight';
import type { DeployAdapter, DeployContext, DeployResult } from '../types';
import { writeFileIfAllowed } from '../utils';

const RENDER_YAML_TEMPLATE = `services:
  - type: web
    name: my-vista-app
    runtime: node
    region: oregon
    plan: free
    buildCommand: |
      npm install --no-audit --no-fund
      npm run build
    startCommand: node .vista/standalone/server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3003"
    healthCheckPath: /
`;

export const renderAdapter: DeployAdapter = {
  id: 'render',
  requiredOutput: 'standalone',
  supportsFullRuntime: true,

  async preflight(ctx) {
    return runStandalonePreflight(ctx);
  },

  async emit(ctx) {
    const renderYamlPath = path.join(ctx.cwd, 'render.yaml');
    const result = writeFileIfAllowed(renderYamlPath, RENDER_YAML_TEMPLATE, ctx.force);
    const artifactPaths = [path.join(ctx.vistaDir, 'standalone', 'server.js')];
    if (result.written || result.skipped) {
      artifactPaths.push(renderYamlPath);
    }

    return {
      status: 'emitted',
      target: 'render',
      artifactPaths,
      instructions: [
        'Connect this repository on Render and select Blueprint (render.yaml).',
        'Or create a Web Service with buildCommand "npm run build" and startCommand "node .vista/standalone/server.js".',
      ],
    };
  },

  async deploy(ctx) {
    const emitted = await renderAdapter.emit(ctx);
    if (ctx.dryRun) {
      return emitted;
    }

    const errors = await renderAdapter.preflight(ctx);
    if (errors.length > 0) {
      return {
        status: 'failed',
        target: 'render',
        warnings: errors,
      };
    }

    if (!isCliAvailable('render')) {
      return {
        status: 'emitted',
        target: 'render',
        artifactPaths: emitted.artifactPaths,
        instructions: [
          'Push to GitHub and connect the repo on https://dashboard.render.com',
          'Render will detect render.yaml automatically.',
          'Ensure NODE_ENV=production and PORT are set in service env vars.',
        ],
      };
    }

    const command = ctx.prod ? 'render deploy --confirm' : 'render deploy';
    const result = runCliCommand(command, { cwd: ctx.cwd, dryRun: ctx.dryRun });
    if (!result.ok) {
      return {
        status: 'emitted',
        target: 'render',
        artifactPaths: emitted.artifactPaths,
        warnings: [result.stderr || 'Render CLI deploy failed.'],
        instructions: emitted.instructions,
      };
    }

    return {
      status: 'deployed',
      target: 'render',
      url: extractDeploymentUrl(`${result.stdout}\n${result.stderr}`),
      artifactPaths: emitted.artifactPaths,
    };
  },
};
