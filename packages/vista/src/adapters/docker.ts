import fs from 'fs';
import path from 'path';
import type { DeploymentAdapter, DeploymentContext } from './types';

export const dockerAdapter: DeploymentAdapter = {
  name: 'docker',
  description: 'Docker containerization adapter',
  build(context: DeploymentContext): void {
    const { cwd, debug } = context;
    const dockerfilePath = path.join(cwd, 'Dockerfile');
    const dockerignorePath = path.join(cwd, '.dockerignore');

    if (!fs.existsSync(dockerfilePath)) {
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
      fs.writeFileSync(dockerfilePath, dockerfileContent);
    }

    if (!fs.existsSync(dockerignorePath)) {
      const dockerignoreContent = `node_modules
.git
.env*.local
`;

      fs.writeFileSync(dockerignorePath, dockerignoreContent);
    }

    if (debug) {
      console.log('[vista:deploy] Generated Dockerfile and .dockerignore');
    }
  },
};
