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
      // Auto-detect the project's package manager so the Dockerfile works for
      // npm, yarn, and pnpm projects without assuming a specific lockfile.
      const hasPnpm = fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'));
      const hasYarn = fs.existsSync(path.join(cwd, 'yarn.lock'));
      const pkgManager = hasPnpm ? 'pnpm' : hasYarn ? 'yarn' : 'npm';

      const installCmd = pkgManager === 'pnpm'
        ? 'RUN corepack enable && corepack prepare pnpm@latest --activate\nRUN pnpm install --frozen-lockfile'
        : pkgManager === 'yarn'
        ? 'RUN yarn install --frozen-lockfile'
        : 'RUN npm ci';

      const buildCmd = pkgManager === 'pnpm' ? 'pnpm run build' : pkgManager === 'yarn' ? 'yarn build' : 'npm run build';
      const copyLock = hasPnpm ? 'pnpm-lock.yaml' : hasYarn ? 'yarn.lock' : 'package-lock.json*';

      const dockerfileContent = `# Multi-stage production Dockerfile for Vista.js
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json ${copyLock} ./
${installCmd}

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN ${buildCmd}

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
