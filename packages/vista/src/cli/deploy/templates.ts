/**
 * Templates for infrastructure files generated during 'vista deploy'
 */

export const DOCKERFILE_TEMPLATE = `FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV production
COPY .vista/standalone ./
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
`;

export const RENDER_YAML_TEMPLATE = (appName: string) => `services:
  - type: web
    name: ${appName}
    runtime: node
    buildCommand: npm run build
    startCommand: node .vista/standalone/server.js
    envVars:
      - key: NODE_ENV
        value: production
`;

export const CLOUDFLARE_REDIRECTS = `# Identity rule for RSC fetches to prevent HTML rewrite
/rsc/*  /rsc/:splat  200
# Catch-all for SPA/Static routing
/*      /index.html  200
`;

export const WRANGLER_PAGES_CONFIG = `name = "vista-app"
compatibility_date = "2024-01-01"
pages_build_output_dir = ".vista/static"
`;
