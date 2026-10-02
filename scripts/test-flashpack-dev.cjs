#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { spawnWithFallback } = require('./fixtures/spawn-utils.cjs');

const repoRoot = path.resolve(__dirname, '..');
const vistaBin = path.join(repoRoot, 'packages', 'vista', 'bin', 'vista.js');
const fixtureRoot = path.join(repoRoot, 'bench', 'app-router-server');
const tempRoot = path.join(repoRoot, '.tmp', 'test-flashpack-dev');
const appDir = path.join(tempRoot, 'fixture');

const EXCLUDED_DIRECTORIES = new Set(['.git', '.vista', '.flash', 'node_modules']);

function copyFixture(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      copyFixture(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const sourceFile = path.join(sourceDir, entry.name);
    const targetFile = path.join(targetDir, entry.name);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
  }
}

function linkOrCopy(target, source) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  try {
    fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    // Fall back to a file symlink / copy when junctions are unavailable.
    try {
      fs.symlinkSync(source, target, 'dir');
    } catch {
      fs.cpSync(source, target, { recursive: true });
    }
  }
}

function resolveInstalledPackage(name, searchRoots) {
  for (const root of searchRoots) {
    try {
      const resolved = require.resolve(`${name}/package.json`, { paths: [root] });
      return path.dirname(resolved);
    } catch {
      // Some packages expose only the main entry via exports.
    }
    try {
      const entry = require.resolve(name, { paths: [root] });
      let current = path.dirname(entry);
      while (true) {
        if (fs.existsSync(path.join(current, 'package.json'))) {
          return current;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    } catch {
      // try next root
    }
  }

  // pnpm store fallback (CI may not hoist apps/web deps to a resolvable root).
  const pnpmDir = path.join(repoRoot, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmDir)) return null;
  const prefix = name.startsWith('@')
    ? `${name.replace('/', '+')}@`
    : `${name}@`;
  const matches = fs
    .readdirSync(pnpmDir)
    .filter((entry) => entry.startsWith(prefix))
    .sort();
  const latest = matches.at(-1);
  if (!latest) return null;
  const candidate = path.join(pnpmDir, latest, 'node_modules', ...name.split('/'));
  return fs.existsSync(path.join(candidate, 'package.json')) ? candidate : null;
}

function ensureFixtureDeps(appDir) {
  const vistaPkg = path.join(repoRoot, 'packages', 'vista');
  const searchRoots = [
    path.join(repoRoot, 'apps', 'web'),
    vistaPkg,
    repoRoot,
    path.join(repoRoot, 'packages', 'create-vista-app'),
  ];
  const nm = path.join(appDir, 'node_modules');
  fs.mkdirSync(nm, { recursive: true });

  linkOrCopy(path.join(nm, 'vista'), vistaPkg);

  // Required for SSR. CSS tooling is optional — the conformance fixture has no globals.css.
  const required = ['react', 'react-dom'];
  const optional = ['postcss', 'tailwindcss', '@tailwindcss/postcss'];
  const linked = {};

  for (const name of required) {
    const source = resolveInstalledPackage(name, searchRoots);
    if (!source) {
      throw new Error(`[test:flashpack-dev] missing dependency ${name} in workspace`);
    }
    const target = name.startsWith('@')
      ? path.join(nm, ...name.split('/'))
      : path.join(nm, name);
    linkOrCopy(target, source);
    linked[name] = '*';
  }

  for (const name of optional) {
    const source = resolveInstalledPackage(name, searchRoots);
    if (!source) continue;
    const target = name.startsWith('@')
      ? path.join(nm, ...name.split('/'))
      : path.join(nm, name);
    linkOrCopy(target, source);
    linked[name] = '*';
  }

  const pkgPath = path.join(appDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = {
    ...(pkg.dependencies || {}),
    vista: `file:${vistaPkg}`,
    ...linked,
  };
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function readJson(absolutePath) {
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

async function waitForHttp(url, child, timeoutMs = 60000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        return response;
      }
    } catch {
      // retry
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.once('error', () => resolve());
      killer.once('close', () => resolve());
    });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function startDevServer(port) {
  const child = await spawnWithFallback(process.execPath, [vistaBin, 'dev', '--engine', 'flashpack'], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      VISTA_DEBUG: '1',
      // Always compile flashpack-cli from this workspace so CI picks up crate fixes.
      VISTA_FLASHPACK_FROM_SOURCE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    const response = await waitForHttp(`http://127.0.0.1:${port}/conformance`, child);
    const html = await response.text();
    assert(
      html.includes('RSC conformance fixture'),
      'Flashpack dev server did not render the conformance page.'
    );
    return { child, output };
  } catch (error) {
    await stopServer(child);
    throw new Error(`${error.message}\n${output}`);
  }
}

function assertFlashDevArtifacts(previousGeneratedAt = 0) {
  const flashDir = path.join(appDir, '.flash');
  const devManifestPath = path.join(flashDir, 'runtime', 'dev-manifest.json');
  const graphPath = path.join(flashDir, 'graph', 'dev-rust.json');
  const latestStatePath = path.join(flashDir, 'state', 'latest.json');

  assert(fs.existsSync(devManifestPath), 'missing .flash/runtime/dev-manifest.json');
  assert(fs.existsSync(graphPath), 'missing .flash/graph/dev-rust.json');
  assert(fs.existsSync(latestStatePath), 'missing .flash/state/latest.json');
  assert(!fs.existsSync(path.join(flashDir, 'turbo')), '.flash/turbo should not exist');
  assert(
    !fs.existsSync(path.join(flashDir, 'cache', 'turbo')),
    '.flash/cache/turbo should not exist'
  );

  const manifest = readJson(devManifestPath);
  const latestState = readJson(latestStatePath);

  assert.equal(manifest.pipeline_owner, 'rust-cli');
  assert.equal(manifest.phase, 'dev');
  assert.equal(latestState.pipeline_owner, 'rust-cli');
  assert.equal(latestState.phase, 'dev');
  assert.equal(latestState.command, 'run');
  assert(
    Number(manifest.generated_at_ms) > previousGeneratedAt,
    'expected dev manifest timestamp to advance on restart'
  );

  return Number(manifest.generated_at_ms);
}

async function main() {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  copyFixture(fixtureRoot, appDir);
  ensureFixtureDeps(appDir);

  let firstRun = null;
  let secondRun = null;

  try {
    firstRun = await startDevServer(4521);
    const firstGeneratedAt = assertFlashDevArtifacts(0);
    await stopServer(firstRun.child);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    secondRun = await startDevServer(4522);
    assertFlashDevArtifacts(firstGeneratedAt);
  } finally {
    if (firstRun?.child) {
      await stopServer(firstRun.child);
    }
    if (secondRun?.child) {
      await stopServer(secondRun.child);
    }
  }

  console.log('[test:flashpack-dev] OK');
}

main().catch((error) => {
  console.error('[test:flashpack-dev] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
