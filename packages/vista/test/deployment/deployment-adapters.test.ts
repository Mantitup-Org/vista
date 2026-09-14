import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  detectDeploymentTarget,
  normalizeDeploymentTarget,
  getDeploymentAdapter,
  getAllDeploymentAdapters,
  vercelAdapter,
  cloudflareAdapter,
  renderAdapter,
  dockerAdapter,
  nodeAdapter,
} from '../../src/deployment';
import { generateDeploymentOutputs } from '../../src/bin/deploy-output';
import { resolveDeploymentConfig, type VistaConfig } from '../../src/config';

function makeTempDir(prefix: string = 'vista-deploy-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('normalizeDeploymentTarget properly normalizes targets and aliases', () => {
  assert.equal(normalizeDeploymentTarget('vercel'), 'vercel');
  assert.equal(normalizeDeploymentTarget('VERCEL'), 'vercel');
  assert.equal(normalizeDeploymentTarget('cloudflare'), 'cloudflare');
  assert.equal(normalizeDeploymentTarget('cf'), 'cloudflare');
  assert.equal(normalizeDeploymentTarget('pages'), 'cloudflare');
  assert.equal(normalizeDeploymentTarget('render'), 'render');
  assert.equal(normalizeDeploymentTarget('docker'), 'docker');
  assert.equal(normalizeDeploymentTarget('container'), 'docker');
  assert.equal(normalizeDeploymentTarget('node'), 'node');
  assert.equal(normalizeDeploymentTarget('standalone'), 'node');
  assert.equal(normalizeDeploymentTarget('auto'), 'auto');

  assert.equal(normalizeDeploymentTarget('aws'), null);
  assert.equal(normalizeDeploymentTarget('unknown'), null);
  assert.equal(normalizeDeploymentTarget(undefined), null);
  assert.equal(normalizeDeploymentTarget(123), null);
});

test('detectDeploymentTarget respects precedence order', () => {
  const cwd = makeTempDir();
  const originalEnv = { ...process.env };

  try {
    delete process.env.VISTA_DEPLOY_TARGET;
    delete process.env.VERCEL;
    delete process.env.CF_PAGES;
    delete process.env.RENDER;
    delete process.env.DOCKER;

    // 1. Fallback when nothing is set -> 'node'
    assert.equal(detectDeploymentTarget(cwd), 'node');

    // 2. File heuristics
    fs.writeFileSync(path.join(cwd, 'render.yaml'), 'services: []');
    assert.equal(detectDeploymentTarget(cwd), 'render');

    fs.writeFileSync(path.join(cwd, 'Dockerfile'), 'FROM node:20');
    // render.yaml comes earlier in heuristic check than Dockerfile
    assert.equal(detectDeploymentTarget(cwd), 'render');

    // 3. Platform env var overrides file heuristic
    process.env.CF_PAGES = '1';
    assert.equal(detectDeploymentTarget(cwd), 'cloudflare');

    process.env.VERCEL = '1';
    assert.equal(detectDeploymentTarget(cwd), 'vercel');

    // 4. User config overrides platform env var
    const configWithDocker: VistaConfig = {
      deployment: { target: 'docker' },
    };
    assert.equal(detectDeploymentTarget(cwd, resolveDeploymentConfig(configWithDocker)), 'docker');

    // 5. VISTA_DEPLOY_TARGET overrides config
    process.env.VISTA_DEPLOY_TARGET = 'render';
    assert.equal(detectDeploymentTarget(cwd, resolveDeploymentConfig(configWithDocker)), 'render');

    // 6. Explicit argument overrides everything
    assert.equal(
      detectDeploymentTarget(cwd, resolveDeploymentConfig(configWithDocker), 'cloudflare'),
      'cloudflare'
    );
  } finally {
    process.env = originalEnv;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('adapter registry resolves all supported deployment adapters', () => {
  assert.equal(getDeploymentAdapter('vercel'), vercelAdapter);
  assert.equal(getDeploymentAdapter('cloudflare'), cloudflareAdapter);
  assert.equal(getDeploymentAdapter('render'), renderAdapter);
  assert.equal(getDeploymentAdapter('docker'), dockerAdapter);
  assert.equal(getDeploymentAdapter('node'), nodeAdapter);
  assert.equal(getDeploymentAdapter('auto'), null);

  const all = getAllDeploymentAdapters();
  assert.equal(all.length, 5);
  const targets = all.map((a) => a.target);
  assert.ok(targets.includes('vercel'));
  assert.ok(targets.includes('cloudflare'));
  assert.ok(targets.includes('render'));
  assert.ok(targets.includes('docker'));
  assert.ok(targets.includes('node'));
});

test('vercelAdapter produces valid Build Output API v3 structure', () => {
  const cwd = makeTempDir();
  const vistaDir = path.join(cwd, '.vista');
  fs.mkdirSync(path.join(cwd, 'public'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'public', 'favicon.ico'), 'icon');
  fs.mkdirSync(path.join(vistaDir, 'static', 'pages'), { recursive: true });
  fs.writeFileSync(path.join(vistaDir, 'static', 'pages', 'index.js'), '// page bundle');
  fs.writeFileSync(path.join(vistaDir, 'client.css'), 'body { margin: 0; }');

  try {
    const deploymentConfig = resolveDeploymentConfig();
    const result = vercelAdapter.generate({
      cwd,
      vistaDir,
      config: {},
      deploymentConfig,
      target: 'vercel',
    });

    assert.equal(result.success, true);
    assert.equal(result.target, 'vercel');

    const outputDir = path.join(cwd, '.vercel', 'output');
    assert.equal(fs.existsSync(outputDir), true);

    // Verify static assets
    assert.equal(fs.existsSync(path.join(outputDir, 'static', 'favicon.ico')), true);
    assert.equal(
      fs.existsSync(path.join(outputDir, 'static', 'static', 'pages', 'index.js')),
      true
    );
    assert.equal(fs.existsSync(path.join(outputDir, 'static', 'client.css')), true);
    assert.equal(fs.existsSync(path.join(outputDir, 'static', 'styles.css')), true);

    // Verify serverless function bundle
    const funcDir = path.join(outputDir, 'functions', 'index.func');
    assert.equal(fs.existsSync(funcDir), true);
    assert.equal(fs.existsSync(path.join(funcDir, '.vc-config.json')), true);
    assert.equal(fs.existsSync(path.join(funcDir, 'index.js')), true);

    const vcConfig = JSON.parse(fs.readFileSync(path.join(funcDir, '.vc-config.json'), 'utf8'));
    assert.equal(vcConfig.runtime, 'nodejs20.x');
    assert.equal(vcConfig.handler, 'index.js');

    // Verify config.json routing
    const configPath = path.join(outputDir, 'config.json');
    assert.equal(fs.existsSync(configPath), true);
    const vercelConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(vercelConfig.version, 3);
    assert.ok(Array.isArray(vercelConfig.routes));
    assert.equal(vercelConfig.routes[0].handle, 'filesystem');

    // Verify blueprint generation
    assert.equal(fs.existsSync(path.join(cwd, 'vercel.json')), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('cloudflareAdapter produces Pages artifacts and _routes.json', () => {
  const cwd = makeTempDir();
  const vistaDir = path.join(cwd, '.vista');
  fs.mkdirSync(path.join(cwd, 'public'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'public', 'logo.svg'), '<svg></svg>');
  fs.mkdirSync(path.join(vistaDir, 'static'), { recursive: true });
  fs.writeFileSync(path.join(vistaDir, 'static', 'bundle.js'), '// bundle');

  try {
    const deploymentConfig = resolveDeploymentConfig();
    const result = cloudflareAdapter.generate({
      cwd,
      vistaDir,
      config: {},
      deploymentConfig,
      target: 'cloudflare',
    });

    assert.equal(result.success, true);
    assert.equal(result.target, 'cloudflare');

    const outputDir = path.join(vistaDir, 'cloudflare');
    assert.equal(fs.existsSync(outputDir), true);

    // Verify static assets copied
    assert.equal(fs.existsSync(path.join(outputDir, 'logo.svg')), true);
    assert.equal(fs.existsSync(path.join(outputDir, 'static', 'bundle.js')), true);

    // Verify _routes.json
    const routesPath = path.join(outputDir, '_routes.json');
    assert.equal(fs.existsSync(routesPath), true);
    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
    assert.equal(routes.version, 1);
    assert.ok(routes.include.includes('/*'));

    // Verify _worker.js
    assert.equal(fs.existsSync(path.join(outputDir, '_worker.js')), true);

    // Verify blueprint wrangler.toml
    assert.equal(fs.existsSync(path.join(cwd, 'wrangler.toml')), true);
    const wrangler = fs.readFileSync(path.join(cwd, 'wrangler.toml'), 'utf8');
    assert.match(wrangler, /compatibility_flags = \["nodejs_compat"\]/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('renderAdapter generates render.yaml blueprint and keep-awake workflow', () => {
  const cwd = makeTempDir();
  const vistaDir = path.join(cwd, '.vista');
  fs.mkdirSync(path.join(cwd, '.github'), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify({ name: 'my-custom-vista-app' }, null, 2)
  );

  try {
    const deploymentConfig = resolveDeploymentConfig();
    const result = renderAdapter.generate({
      cwd,
      vistaDir,
      config: {},
      deploymentConfig,
      target: 'render',
    });

    assert.equal(result.success, true);
    assert.equal(result.target, 'render');

    // Verify render.yaml
    const renderYamlPath = path.join(cwd, 'render.yaml');
    assert.equal(fs.existsSync(renderYamlPath), true);
    const yamlContent = fs.readFileSync(renderYamlPath, 'utf8');
    assert.match(yamlContent, /name: my-custom-vista-app/);
    assert.match(yamlContent, /buildCommand: npm install --no-audit --no-fund && npm run build/);
    assert.match(yamlContent, /startCommand: npm run start/);

    // Verify keep-awake workflow
    const workflowPath = path.join(cwd, '.github', 'workflows', 'keep-render-awake.yml');
    assert.equal(fs.existsSync(workflowPath), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('dockerAdapter generates Dockerfile and .dockerignore', () => {
  const cwd = makeTempDir();
  const vistaDir = path.join(cwd, '.vista');

  try {
    const deploymentConfig = resolveDeploymentConfig({
      deployment: { port: 8080 },
    });
    const result = dockerAdapter.generate({
      cwd,
      vistaDir,
      config: {},
      deploymentConfig,
      target: 'docker',
    });

    assert.equal(result.success, true);
    assert.equal(result.target, 'docker');

    // Verify Dockerfile
    const dockerfilePath = path.join(cwd, 'Dockerfile');
    assert.equal(fs.existsSync(dockerfilePath), true);
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    assert.match(dockerfile, /FROM node:20-alpine AS runner/);
    assert.match(dockerfile, /ENV PORT=8080/);
    assert.match(dockerfile, /EXPOSE 8080/);
    assert.match(dockerfile, /CMD \["node", "server\.js"\]/);

    // Verify .dockerignore
    const dockerignorePath = path.join(cwd, '.dockerignore');
    assert.equal(fs.existsSync(dockerignorePath), true);
    const dockerignore = fs.readFileSync(dockerignorePath, 'utf8');
    assert.match(dockerignore, /node_modules/);
    assert.match(dockerignore, /\.vista/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('generateDeploymentOutputs coordinates target detection and adapter execution', () => {
  const cwd = makeTempDir();
  const vistaDir = path.join(cwd, '.vista');

  try {
    const result = generateDeploymentOutputs({
      cwd,
      vistaDir,
      target: 'docker',
    });

    assert.ok(result);
    assert.equal(result.target, 'docker');
    assert.equal(result.success, true);
    assert.equal(fs.existsSync(path.join(cwd, 'Dockerfile')), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
