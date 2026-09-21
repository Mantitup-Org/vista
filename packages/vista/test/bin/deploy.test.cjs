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
    assert.equal(
      fs.existsSync(path.join(cwd, '.vercel', 'output', 'functions', 'index.func', '.vista', 'standalone', 'server.js')),
      true
    );
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
    assert.match(fs.readFileSync(path.join(cwd, 'Dockerfile'), 'utf8'), /node_modules/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('cloudflare static emit flattens pages and copies /_vista/static', async () => {
  const cwd = makeTempWorkspace();
  try {
    writeMinimalVistaArtifacts(cwd);
    fs.mkdirSync(path.join(cwd, 'public'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'public', 'vista.svg'), '<svg></svg>', 'utf8');
    fs.mkdirSync(path.join(cwd, '.vista', 'static', 'chunks'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.vista', 'static', 'chunks', 'main.js'), 'console.log(1)', 'utf8');
    fs.mkdirSync(path.join(cwd, '.vista', 'static', 'pages', 'docs'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.vista', 'static', 'pages', 'docs.html'), '<html>docs</html>', 'utf8');
    fs.writeFileSync(path.join(cwd, '.vista', 'static', 'pages', 'index.rsc'), 'flight-index', 'utf8');
    fs.writeFileSync(path.join(cwd, '.vista', 'static', 'pages', 'docs.rsc'), 'flight-docs', 'utf8');

    const adapter = getDeployAdapter('cloudflare');
    const result = await adapter.emit({
      cwd,
      vistaDir: path.join(cwd, '.vista'),
      config: { deploy: { target: 'cloudflare', output: 'static' } },
      deployConfig: resolveDeployConfig({ deploy: { target: 'cloudflare', output: 'static' } }),
      target: 'cloudflare',
      dryRun: true,
      skipBuild: true,
      prod: true,
      preview: false,
      force: true,
    });

    assert.equal(result.status, 'emitted');
    const outputDir = path.join(cwd, '.vista', 'deploy', 'cloudflare');
    assert.equal(fs.existsSync(path.join(outputDir, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(outputDir, 'docs', 'index.html')), true);
    assert.equal(fs.existsSync(path.join(outputDir, 'vista.svg')), true);
    assert.equal(fs.existsSync(path.join(outputDir, '_vista', 'static', 'chunks', 'main.js')), true);
    assert.equal(fs.readFileSync(path.join(outputDir, 'rsc', 'index.rsc'), 'utf8'), 'flight-index');
    assert.equal(fs.readFileSync(path.join(outputDir, 'rsc', 'docs.rsc'), 'utf8'), 'flight-docs');
    const redirects = fs.readFileSync(path.join(outputDir, '_redirects'), 'utf8');
    assert.match(redirects, /^\/rsc\/docs\.rsc \/rsc\/docs\.rsc 200$/m);
    assert.match(redirects, /^\/rsc\/docs \/rsc\/docs\.rsc 200$/m);
    assert.doesNotMatch(redirects, /\/rsc\/\* \/rsc\/:splat\.rsc 200/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('svg Image props skip /_vista/image srcSet', () => {
  const { getImgProps } = require('../../dist/image/get-img-props');
  const { defaultLoader } = require('../../dist/image/image-loader');
  const { imageConfigDefault } = require('../../dist/image/image-config');
  const props = getImgProps(
    { src: '/vista.svg', alt: 'logo', width: 120, height: 40 },
    imageConfigDefault,
    defaultLoader
  );
  assert.equal(props.src, '/vista.svg');
  assert.equal(props.srcSet, undefined);
});

test('PPR shell HTML does not inline the full-page Flight payload', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/server/static-generator.ts'), 'utf8');
  const fn = src.slice(
    src.indexOf('async function attachFlightPayload'),
    src.indexOf('function getCSSLinks')
  );
  assert.match(fn, /page\.html = injectInlineFlightBootstrap/);
  assert.doesNotMatch(
    fn,
    /shellHtml = injectInlineFlightBootstrap/,
    'PPR shells must stay loading-only; full Flight belongs on page.html'
  );
});

test('SSG HTML inlines Flight payload before deferred chunks', () => {
  const { injectInlineFlightBootstrap } = require('../../dist/server/static-generator');
  const html = [
    '<html><body>',
    '<script>window.__VISTA_HYDRATE_DOCUMENT__ = true;</script>',
    '<script defer src="/_vista/static/chunks/main.js"></script>',
    '</body></html>',
  ].join('\n');
  const next = injectInlineFlightBootstrap(html, '1:["$","div"]');
  assert.match(next, /window\.__VISTA_RSC_DATA__=/);
  assert.ok(
    next.indexOf('__VISTA_RSC_DATA__') < next.indexOf('<script defer'),
    'Flight bootstrap must run before deferred hydration chunks'
  );
});

test('netlify adapter emit packs Flight function with .vista standalone', async () => {
  const cwd = makeTempWorkspace();
  try {
    writeMinimalVistaArtifacts(cwd);
    const adapter = getDeployAdapter('netlify');
    const result = await adapter.emit({
      cwd,
      vistaDir: path.join(cwd, '.vista'),
      config: {},
      deployConfig: resolveDeployConfig({}),
      target: 'netlify',
      dryRun: true,
      skipBuild: true,
      prod: true,
      preview: false,
      force: true,
    });

    assert.equal(result.status, 'emitted');
    assert.equal(fs.existsSync(path.join(cwd, 'netlify', 'functions', 'ssr.js')), true);
    assert.equal(
      fs.existsSync(path.join(cwd, 'netlify', 'functions', '.vista', 'standalone', 'server.js')),
      true
    );
    const handler = fs.readFileSync(path.join(cwd, 'netlify', 'functions', 'ssr.js'), 'utf8');
    assert.match(handler, /http\.ServerResponse/);
    assert.match(fs.readFileSync(path.join(cwd, 'netlify.toml'), 'utf8'), /\.netlify\/functions\/ssr/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
