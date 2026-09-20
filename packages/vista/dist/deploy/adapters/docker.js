"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dockerAdapter = exports.DOCKERFILE_TEMPLATE = void 0;
const path_1 = __importDefault(require("path"));
const cli_runner_1 = require("../cli-runner");
const preflight_1 = require("../preflight");
const utils_1 = require("../utils");
exports.DOCKERFILE_TEMPLATE = `# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

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
exports.dockerAdapter = {
    id: 'docker',
    requiredOutput: 'standalone',
    supportsFullRuntime: true,
    async preflight(ctx) {
        return (0, preflight_1.runStandalonePreflight)(ctx);
    },
    async emit(ctx) {
        const dockerfilePath = path_1.default.join(ctx.cwd, 'Dockerfile');
        const dockerignorePath = path_1.default.join(ctx.cwd, '.dockerignore');
        (0, utils_1.writeFileIfAllowed)(dockerfilePath, exports.DOCKERFILE_TEMPLATE, ctx.force);
        (0, utils_1.writeFileIfAllowed)(dockerignorePath, DOCKERIGNORE_TEMPLATE, ctx.force);
        return {
            status: 'emitted',
            target: 'docker',
            artifactPaths: [
                path_1.default.join(ctx.vistaDir, 'standalone', 'server.js'),
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
        const emitted = await exports.dockerAdapter.emit(ctx);
        if (ctx.dryRun) {
            return emitted;
        }
        const errors = await exports.dockerAdapter.preflight(ctx);
        if (errors.length > 0) {
            return {
                status: 'failed',
                target: 'docker',
                warnings: errors,
            };
        }
        if (!(0, cli_runner_1.isCliAvailable)('docker')) {
            return {
                status: 'emitted',
                target: 'docker',
                artifactPaths: emitted.artifactPaths,
                warnings: ['Docker CLI not found.'],
                instructions: emitted.instructions,
            };
        }
        const imageTag = 'my-vista-app';
        const buildResult = (0, cli_runner_1.runCliCommand)(`docker build -t ${imageTag} .`, {
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
