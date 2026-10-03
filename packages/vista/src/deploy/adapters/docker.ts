import fs from 'fs';
import path from 'path';

import { isCliAvailable, runCliCommand } from '../cli-runner';
import { runStandalonePreflight } from '../preflight';
import type { DeployAdapter } from '../types';
import { writeFileIfAllowed } from '../utils';

export const DOCKERFILE_TEMPLATE = `# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f pnpm-lock.yaml ]; then \\
      corepack enable pnpm && pnpm install --no-audit --no-fund; \\
    elif [ -f yarn.lock ]; then \\
      yarn install --no-audit --no-fund; \\
    else \\
      npm install --no-audit --no-fund; \\
    fi
COPY . .
RUN if [ -f pnpm-lock.yaml ]; then \\
      pnpm run build; \\
    elif [ -f yarn.lock ]; then \\
      yarn build; \\
    else \\
      npm run build; \\
    fi

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3003
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.vista ./.vista
EXPOSE 3003
CMD ["node", ".vista/standalone/server.js"]
`;

const DOCKERIGNORE_TEMPLATE = `node_modules
.git
.vista/cache
.flash
.next
.vercel
dist
coverage
*.log
.env*
`;

export const dockerAdapter: DeployAdapter = {
  id: 'docker',
  requiredOutput: 'standalone',
  supportsFullRuntime: true,

  async preflight(ctx) {
    return runStandalonePreflight(ctx);
  },

  async emit(ctx) {
    const dockerfilePath = path.join(ctx.cwd, 'Dockerfile');
    const dockerignorePath = path.join(ctx.cwd, '.dockerignore');

    writeFileIfAllowed(dockerfilePath, DOCKERFILE_TEMPLATE, ctx.force);
    writeFileIfAllowed(dockerignorePath, DOCKERIGNORE_TEMPLATE, ctx.force);

    return {
      status: 'emitted',
      target: 'docker',
      artifactPaths: [
        path.join(ctx.vistaDir, 'standalone', 'server.js'),
        dockerfilePath,
        dockerignorePath,
      ],
      instructions: [
        'Build image: docker build -t my-vista-app .',
        'Run container: docker run -p 3003:3003 -e PORT=3003 my-vista-app',
      ],
    };
  },

  async deploy(ctx) {
    const emitted = await dockerAdapter.emit(ctx);
    if (ctx.dryRun) {
      return emitted;
    }

    const errors = await dockerAdapter.preflight(ctx);
    if (errors.length > 0) {
      return {
        status: 'failed',
        target: 'docker',
        warnings: errors,
      };
    }

    if (!isCliAvailable('docker')) {
      return {
        status: 'emitted',
        target: 'docker',
        artifactPaths: emitted.artifactPaths,
        warnings: ['Docker CLI not found.'],
        instructions: emitted.instructions,
      };
    }

    const imageTag = 'my-vista-app';
    const buildResult = runCliCommand(`docker build -t ${imageTag} .`, {
      cwd: ctx.cwd,
      dryRun: ctx.dryRun,
    });

    if (!buildResult.ok) {
      return {
        status: 'emitted',
        target: 'docker',
        artifactPaths: emitted.artifactPaths,
        warnings: [buildResult.stderr || 'Docker build failed.'],
        instructions: emitted.instructions,
      };
    }

    return {
      status: 'deployed',
      target: 'docker',
      artifactPaths: emitted.artifactPaths,
      instructions: [
        `Image built: ${imageTag}`,
        `Run locally: docker run -p 3003:3003 -e PORT=3003 ${imageTag}`,
      ],
    };
  },
};
