"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dockerAdapter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.dockerAdapter = {
    name: 'docker',
    description: 'Docker containerization adapter',
    build(context) {
        const { cwd, debug } = context;
        const dockerfilePath = path_1.default.join(cwd, 'Dockerfile');
        const dockerignorePath = path_1.default.join(cwd, '.dockerignore');
        if (!fs_1.default.existsSync(dockerfilePath)) {
            const dockerfileContent = `# Multi-stage production Dockerfile for Vista.js
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

COPY --from=builder /app/.vista ./.vista
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=dependencies /app/node_modules ./node_modules

# Run as non-root for security best practice
RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 vista && \\
    chown -R vista:nodejs /app
USER vista

CMD ["node", ".vista/standalone/server.js"]
`;
            fs_1.default.writeFileSync(dockerfilePath, dockerfileContent);
        }
        if (!fs_1.default.existsSync(dockerignorePath)) {
            const dockerignoreContent = `node_modules
.git
.env*.local
`;
            fs_1.default.writeFileSync(dockerignorePath, dockerignoreContent);
        }
        if (debug) {
            console.log('[vista:deploy] Generated Dockerfile and .dockerignore');
        }
    },
};
