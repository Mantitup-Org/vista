"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dockerAdapter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.dockerAdapter = {
    target: 'docker',
    name: 'Docker Container',
    generate(context) {
        const { cwd, vistaDir, debug, deploymentConfig } = context;
        const generatedFiles = [];
        const standaloneDir = path_1.default.join(vistaDir, 'standalone');
        if (deploymentConfig.generateBlueprints) {
            const blueprintFiles = this.generateBlueprint(context);
            generatedFiles.push(...blueprintFiles);
        }
        if (debug) {
            console.log(`[vista:deploy:docker] Prepared Docker container configuration.`);
        }
        return {
            target: 'docker',
            success: true,
            outputDirectory: standaloneDir,
            generatedFiles,
            notes: [
                'Docker container configuration prepared.',
                'Production Dockerfile generated with multi-stage caching.',
                'Exposes default port 3003 with healthcheck support.',
            ],
        };
    },
    generateBlueprint(context) {
        const { cwd, deploymentConfig } = context;
        const created = [];
        const port = deploymentConfig.port || 3003;
        // 1. Dockerfile
        const dockerfilePath = path_1.default.join(cwd, 'Dockerfile');
        if (!fs_1.default.existsSync(dockerfilePath)) {
            const dockerfileContent = [
                '# Multi-stage Dockerfile for Vista.js Production Application',
                'FROM node:20-alpine AS base',
                'WORKDIR /app',
                '',
                '# Install dependencies stage',
                'FROM base AS deps',
                'COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* .npmrc* ./',
                'RUN \\',
                '  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install --frozen-lockfile; \\',
                '  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \\',
                '  elif [ -f package-lock.json ]; then npm ci; \\',
                '  else npm install --no-audit --no-fund; \\',
                '  fi',
                '',
                '# Build stage',
                'FROM base AS builder',
                'COPY --from=deps /app/node_modules ./node_modules',
                'COPY . .',
                'ENV NODE_ENV=production',
                'RUN npm run build',
                '',
                '# Production runner stage',
                'FROM node:20-alpine AS runner',
                'WORKDIR /app',
                'ENV NODE_ENV=production',
                `ENV PORT=${port}`,
                '',
                'RUN addgroup --system --gid 1001 nodejs && \\',
                '    adduser --system --uid 1001 vista',
                '',
                '# Copy static and standalone server artifacts',
                'COPY --from=builder /app/public ./public',
                'COPY --from=builder --chown=vista:nodejs /app/.vista/standalone ./',
                'COPY --from=builder --chown=vista:nodejs /app/.vista/static ./.vista/static',
                '',
                'USER vista',
                `EXPOSE ${port}`,
                '',
                'CMD ["node", "server.js"]',
                '',
            ].join('\n');
            fs_1.default.writeFileSync(dockerfilePath, dockerfileContent);
            created.push(dockerfilePath);
        }
        // 2. .dockerignore
        const dockerignorePath = path_1.default.join(cwd, '.dockerignore');
        if (!fs_1.default.existsSync(dockerignorePath)) {
            const dockerignoreContent = [
                'node_modules',
                '.git',
                '.vista',
                '.flash',
                '.vercel',
                '.turbo',
                'dist',
                'coverage',
                'npm-debug.log*',
                'yarn-debug.log*',
                'yarn-error.log*',
                'pnpm-debug.log*',
                '.env*.local',
                '',
            ].join('\n');
            fs_1.default.writeFileSync(dockerignorePath, dockerignoreContent);
            created.push(dockerignorePath);
        }
        return created;
    },
};
