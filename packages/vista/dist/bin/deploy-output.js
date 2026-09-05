"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDeploymentOutputs = generateDeploymentOutputs;
exports.printDeployHelp = printDeployHelp;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function isVercelBuildEnvironment() {
    return process.env.VERCEL === '1' || process.env.NOW_REGION !== undefined;
}
function hasUserVercelConfig(cwd) {
    return fs_1.default.existsSync(path_1.default.join(cwd, 'vercel.json'));
}
function copyDirectoryRecursive(sourceDir, targetDir) {
    if (!fs_1.default.existsSync(sourceDir))
        return;
    fs_1.default.mkdirSync(targetDir, { recursive: true });
    const entries = fs_1.default.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const from = path_1.default.join(sourceDir, entry.name);
        const to = path_1.default.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(from, to);
        }
        else if (entry.isFile()) {
            fs_1.default.copyFileSync(from, to);
        }
    }
}
function copyFileIfPresent(sourceFile, targetFile) {
    if (!fs_1.default.existsSync(sourceFile))
        return;
    fs_1.default.mkdirSync(path_1.default.dirname(targetFile), { recursive: true });
    fs_1.default.copyFileSync(sourceFile, targetFile);
}
function writeVercelBuildOutput(options) {
    const { cwd, vistaDir, debug } = options;
    if (!isVercelBuildEnvironment()) {
        return;
    }
    if (hasUserVercelConfig(cwd)) {
        if (debug) {
            console.log('[vista:deploy] Found custom vercel.json, skipping internal Vercel output.');
        }
        return;
    }
    const vercelOutputDir = path_1.default.join(cwd, '.vercel', 'output');
    const vercelStaticDir = path_1.default.join(vercelOutputDir, 'static');
    fs_1.default.rmSync(vercelOutputDir, { recursive: true, force: true });
    fs_1.default.mkdirSync(vercelStaticDir, { recursive: true });
    // Public assets: /favicon.ico, /vista.svg, etc.
    copyDirectoryRecursive(path_1.default.join(cwd, 'public'), vercelStaticDir);
    // Vista static artifacts: /static/pages, /static/chunks, etc.
    copyDirectoryRecursive(path_1.default.join(vistaDir, 'static'), path_1.default.join(vercelStaticDir, 'static'));
    // Global CSS alias support (/styles.css and /client.css)
    const clientCssPath = path_1.default.join(vistaDir, 'client.css');
    copyFileIfPresent(clientCssPath, path_1.default.join(vercelStaticDir, 'client.css'));
    copyFileIfPresent(clientCssPath, path_1.default.join(vercelStaticDir, 'styles.css'));
    const config = {
        version: 3,
        routes: [
            { handle: 'filesystem' },
            { src: '^/_vista/(.*)$', dest: '/$1' },
            { src: '^/(?:rsc|_rsc)/?$', dest: '/static/pages/index.rsc' },
            { src: '^/(?:rsc|_rsc)/(.+)$', dest: '/static/pages/$1.rsc' },
            { src: '^/$', dest: '/static/pages/index.html' },
            { src: '^/(.+)$', dest: '/static/pages/$1.html' },
        ],
    };
    fs_1.default.writeFileSync(path_1.default.join(vercelOutputDir, 'config.json'), JSON.stringify(config, null, 2));
    if (debug) {
        console.log('[vista:deploy] Generated internal Vercel Build Output at .vercel/output/');
    }
}
function writeDeployAdapters(options) {
    const { cwd, vistaDir, debug } = options;
    const deployDir = path_1.default.join(vistaDir, 'deploy');
    fs_1.default.mkdirSync(deployDir, { recursive: true });
    const dockerfile = `FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f pnpm-lock.yaml ]; then npm i -g pnpm && pnpm install --frozen-lockfile; \\
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \\
    else npm install --legacy-peer-deps; fi
COPY . .
RUN npx vista build
EXPOSE 3003
ENV NODE_ENV=production
ENV PORT=3003
CMD ["npx", "vista", "start"]
`;
    const renderYaml = `services:
  - type: web
    name: vista-app
    runtime: node
    plan: free
    buildCommand: npm install --legacy-peer-deps && npx vista build
    startCommand: npx vista start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3003
    healthCheckPath: /
`;
    const wranglerToml = `name = "vista-app"
compatibility_date = "2026-01-01"
main = ".vista/deploy/cloudflare-worker.js"

[assets]
directory = ".vista/static"
binding = "ASSETS"

[vars]
VISTA_PLATFORM = "cloudflare"
`;
    const cloudflareWorker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (env.ASSETS) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }
    return new Response(
      JSON.stringify({
        error: 'Dynamic Vista routes need a Node.js host. Deploy API/RSC traffic to Render, Fly, or Docker.',
        path: url.pathname,
      }),
      { status: 501, headers: { 'content-type': 'application/json' } }
    );
  }
};
`;
    const vercelJson = `{
  "version": 2,
  "buildCommand": "npx vista build",
  "outputDirectory": ".vista",
  "framework": null,
  "installCommand": "npm install --legacy-peer-deps --no-audit --no-fund",
  "devCommand": "npx vista dev"
}
`;
    const readme = `# Vista deployment adapters

These files are generated by \`vista build\` so a Vista app can deploy with minimal configuration.

## Node hosts (recommended for full-stack, API, RSC, agents)

Use the generated Dockerfile or Render blueprint:

- Render: \`render.yaml\`
- Docker / Fly / Railway / Cloud Run: \`Dockerfile\`
- Start command: \`npx vista start\`

## Vercel

Static assets are emitted to \`.vista/\`. For Server Actions, API routes, and agents, use a Node.js host or Vercel's long-running Node runtime.

If this project has no custom \`vercel.json\`, copy \`.vista/deploy/vercel.json\` to the project root.

## Cloudflare

\`wrangler.toml\` serves pre-rendered static assets. Dynamic RSC/API traffic should be proxied to a Node.js origin.

## Zero-config rule

1. \`npx vista build\`
2. Deploy with the platform file that matches your host
3. Set \`PORT\` if the platform does not default to 3003
`;
    fs_1.default.writeFileSync(path_1.default.join(deployDir, 'Dockerfile'), dockerfile);
    fs_1.default.writeFileSync(path_1.default.join(deployDir, 'render.yaml'), renderYaml);
    fs_1.default.writeFileSync(path_1.default.join(deployDir, 'wrangler.toml'), wranglerToml);
    fs_1.default.writeFileSync(path_1.default.join(deployDir, 'cloudflare-worker.js'), cloudflareWorker);
    fs_1.default.writeFileSync(path_1.default.join(deployDir, 'vercel.json'), vercelJson);
    fs_1.default.writeFileSync(path_1.default.join(deployDir, 'README.md'), readme);
    if (debug) {
        console.log('[vista:deploy] Wrote platform adapters to .vista/deploy/');
    }
}
function generateDeploymentOutputs(options) {
    writeVercelBuildOutput(options);
    writeDeployAdapters(options);
}
function printDeployHelp(cwd = process.cwd()) {
    const deployDir = path_1.default.join(cwd, '.vista', 'deploy');
    console.log('Vista deployment');
    console.log('');
    console.log('Build first:');
    console.log('  npx vista build');
    console.log('');
    console.log('Then pick a platform:');
    console.log('  Render      use .vista/deploy/render.yaml (or repo render.yaml)');
    console.log('  Docker      use Dockerfile');
    console.log('  Vercel      use .vista/deploy/vercel.json');
    console.log('  Cloudflare  use .vista/deploy/wrangler.toml for static assets');
    console.log('');
    console.log(`Adapters directory: ${deployDir}`);
}
