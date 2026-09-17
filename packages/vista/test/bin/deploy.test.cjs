#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { resolveDeployConfig } = require('../../dist/config');
const { getDeployAdapter } = require('../../dist/deploy/adapters');
const {
  listKnownTargets,
  normalizeResolvedTarget,
  resolveDeployTarget,
} = require('../../dist/deploy/detect');
const { runDeploy } = require('../../dist/deploy/index');
const { runDeployCommand } = require('../../dist/bin/deploy');

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vista-deploy-'));
}

function writeMinimalVistaArtifacts(cwd) {
  const vistaDir = path.join(cwd, '.vista');
  fs.mkdirSync(path.join(vistaDir, 'standalone'), { recursive: true });
  fs.mkdirSync(path.join(vistaDir, 'server'), { recursive: true });
  fs.mkdirSync(path.join(vistaDir, 'static', 'pages'), { recursive: true });

  const requiredFiles = [
    'BUILD_ID',
    'artifact-manifest.json',
    'build-manifest.json',
    'routes-manifest.json',
    'app-path-routes-manifest.json',
    'prerender-manifest.json',
    'required-server-files.json',
    'react-client-manifest.json',
    'react-server-manifest.json',
    'server/server-manifest.json',
    'server/runtime-manifest.json',
    'server/file-trace.json',
    'standalone/server.js',
  ];

  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(vistaDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    if (relativePath.endsWith('.json')) {
      const payload =
        relativePath === 'artifact-manifest.json' ||
        relativePath === 'server/runtime-manifest.json' ||
        relativePath === 'server/file-trace.json'
          ? { schemaVersion: 1, copiedFiles: [] }
          : relativePath === 'prerender-manifest.json'
            ? { routes: { '/': {} } }
            : relativePath === 'routes-manifest.json'
              ? { staticRoutes: [{ page: '/' }] }
              : {};
      fs.writeFileSync(absolutePath, `${JSON.stringify(payload)}\n`, 'utf8');
    } else {
      fs.writeFileSync(absolutePath, 'ok', 'utf8');
    }
  }

  fs.writeFileSync(path.join(vistaDir, 'static', 'pages', 'index.html'), '<html></html>', 'utf8');
}

test('resolveDeployTarget prefers CLI flag over config and env', () => {
  const cwd = makeTempWorkspace();
  try {
    const deployConfig = resolveDeployConfig({ deploy: { target: 'render' } });
    assert.equal(resolveDeployTarget(cwd, deployConfig, 'vercel'), 'vercel');
    assert.equal(resolveDeployTarget(cwd, deployConfig, null), 'render');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('normalizeResolvedTarget accepts known platform ids', () => {
  assert.equal(normalizeResolvedTarget('render'), 'render');
  assert.equal(normalizeResolvedTarget('VERCEL'), 'vercel');
  assert.equal(normalizeResolvedTarget('unknown'), null);
});

test('listKnownTargets includes auto and all platforms', () => {
  const targets = listKnownTargets();
  assert.equal(targets.includes('auto'), true);
  assert.equal(targets.includes('docker'), true);
});

test('render adapter emit does not overwrite existing render.yaml without force', async () => {
  const cwd = makeTempWorkspace();
  try {
    writeMinimalVistaArtifacts(cwd);
    fs.writeFileSync(path.join(cwd, 'render.yaml'), 'custom: true\n', 'utf8');

    const adapter = getDeployAdapter('render');
    const result = await adapter.emit({
      cwd,
      vistaDir: path.join(cwd, '.vista'),
      config: {},
      deployConfig: resolveDeployConfig({}),
      target: 'render',
      dryRun: true,
      skipBuild: true,
      prod: true,
      preview: false,
      force: false,
    });

    assert.equal(result.status, 'emitted');
    assert.equal(fs.readFileSync(path.join(cwd, 'render.yaml'), 'utf8'), 'custom: true\n');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('vercel adapter dry-run emits build output when forced', async () => {
  const cwd = makeTempWorkspace();
  try {
    writeMinimalVistaArtifacts(cwd);
    fs.mkdirSync(path.join(cwd, 'public'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'public', 'favicon.ico'), 'icon', 'utf8');

    const adapter = getDeployAdapter('vercel');
    const result = await adapter.emit({
      cwd,
      vistaDir: path.join(cwd, '.vista'),
      config: { deploy: { preferBuildOutputApi: true } },
      deployConfig: resolveDeployConfig({ deploy: { preferBuildOutputApi: true } }),
      target: 'vercel',
      dryRun: true,
      skipBuild: true,
      prod: true,
      preview: false,
      force: true,
    });

    assert.equal(result.status, 'emitted');
    assert.equal(fs.existsSync(path.join(cwd, '.vercel', 'output', 'config.json')), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('runDeployCommand returns non-zero when target cannot be detected', async () => {
  const cwd = makeTempWorkspace();
  try {
    fs.writeFileSync(
      path.join(cwd, 'package.json'),
      JSON.stringify({ name: 'tmp', scripts: {} }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(cwd, 'vista.config.ts'),
      ['const config = { deploy: { target: "auto" } };', 'export default config;'].join('\n'),
      'utf8'
    );

    const code = await runDeployCommand(['--skip-build'], { cwd });
    assert.equal(code, 1);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('runDeploy dry-run succeeds for docker target with existing artifacts', async () => {
  const cwd = makeTempWorkspace();
  try {
    writeMinimalVistaArtifacts(cwd);

    const result = await runDeploy({
      cwd,
      target: 'docker',
      dryRun: true,
      skipBuild: true,
      force: true,
    });

    assert.equal(result.status, 'emitted');
    assert.equal(fs.existsSync(path.join(cwd, 'Dockerfile')), true);
    assert.match(fs.readFileSync(path.join(cwd, 'Dockerfile'), 'utf8'), /standalone\/server\.js/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
