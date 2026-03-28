#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const vistaBin = path.join(repoRoot, 'packages', 'vista', 'bin', 'vista.js');
const fixtureRoot = path.join(repoRoot, 'bench', 'app-router-server');
const tempRoot = path.join(repoRoot, '.tmp', 'test-flashpack-state');

const EXCLUDED_DIRECTORIES = new Set(['.git', '.vista', '.flash', 'node_modules']);

function log(message) {
  console.log(`[test:flashpack-state] ${message}`);
}

function copyFixture(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      copyFixture(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
      continue;
    }

    if (!entry.isFile()) continue;
    const sourceFile = path.join(sourceDir, entry.name);
    const targetFile = path.join(targetDir, entry.name);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
  }
}

function seedLegacyCache(appDir) {
  const legacyPaths = [
    path.join(appDir, '.turbo', 'trace.txt'),
    path.join(appDir, '.flash', 'turbo', 'cache.txt'),
    path.join(appDir, '.flash', 'cache', 'turbo', 'cache.txt'),
  ];

  for (const target of legacyPaths) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'legacy', 'utf8');
  }
}

function assertLegacyCacheRemoved(appDir) {
  assert(!fs.existsSync(path.join(appDir, '.turbo')), 'legacy .turbo directory should be removed');
  assert(
    !fs.existsSync(path.join(appDir, '.flash', 'turbo')),
    'legacy .flash/turbo directory should be removed'
  );
  assert(
    !fs.existsSync(path.join(appDir, '.flash', 'cache', 'turbo')),
    'legacy .flash/cache/turbo directory should be removed'
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd || repoRoot,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out: node ${args.join(' ')}`));
    }, options.timeoutMs || 240000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`Command failed (${code}): node ${args.join(' ')}\n${stdout}\n${stderr}`));
    });
  });
}

async function waitForHttp(url, child, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.ok) {
        return response;
      }
    } catch {
      // retry
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`Timed out waiting for server: ${url}`);
}

async function startServer(appDir, port) {
  const child = spawn(process.execPath, [vistaBin, 'start', '--engine', 'flashpack'], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForHttp(`http://127.0.0.1:${port}/conformance`, child, 45000);
    return { child, getOutput: () => output };
  } catch (error) {
    child.kill('SIGTERM');
    throw new Error(`${error.message}\n${output}`);
  }
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function verifyBuildReuse(appDir) {
  const flashDir = path.join(appDir, '.flash');
  const statePath = path.join(flashDir, 'state', 'latest.json');
  const buildManifestPath = path.join(flashDir, 'runtime', 'build-manifest.json');

  seedLegacyCache(appDir);
  await runNode([vistaBin, 'build', '--engine', 'flashpack'], { cwd: appDir, timeoutMs: 300000 });
  assertLegacyCacheRemoved(appDir);

  const firstState = readJson(statePath);
  const firstBuildManifest = readJson(buildManifestPath);
  assert.equal(firstState.pipeline_owner, 'rust-cli', 'first build must be rust-owned');
  assert.equal(firstBuildManifest.phase, 'build', 'first build manifest must record build phase');

  seedLegacyCache(appDir);
  await new Promise((resolve) => setTimeout(resolve, 25));
  await runNode([vistaBin, 'build', '--engine', 'flashpack'], { cwd: appDir, timeoutMs: 300000 });
  assertLegacyCacheRemoved(appDir);

  const secondState = readJson(statePath);
  const secondBuildManifest = readJson(buildManifestPath);
  assert(
    secondState.generated_at_ms > firstState.generated_at_ms,
    'second build should refresh .flash/state/latest.json timestamp'
  );
  assert(
    secondBuildManifest.generated_at_ms > firstBuildManifest.generated_at_ms,
    'second build should refresh .flash/runtime/build-manifest.json timestamp'
  );
}

async function verifyStartReuse(appDir) {
  const flashDir = path.join(appDir, '.flash');
  const statePath = path.join(flashDir, 'state', 'latest.json');
  const startManifestPath = path.join(flashDir, 'runtime', 'start-manifest.json');
  const appSourceDir = path.join(appDir, 'app');
  const hiddenAppSourceDir = path.join(appDir, 'app.__hidden');

  if (fs.existsSync(appSourceDir)) {
    fs.renameSync(appSourceDir, hiddenAppSourceDir);
  }

  seedLegacyCache(appDir);
  const firstServer = await startServer(appDir, 4332);
  try {
    const response = await fetch('http://127.0.0.1:4332/conformance');
    assert.equal(response.status, 200, 'first flashpack start must serve the conformance route');
  } finally {
    await stopServer(firstServer.child);
  }
  assertLegacyCacheRemoved(appDir);

  const firstState = readJson(statePath);
  const firstStartManifest = readJson(startManifestPath);
  assert.equal(firstState.phase, 'start', 'latest state should record start after server boot');
  assert.equal(firstStartManifest.pipeline_owner, 'rust-cli', 'start manifest must be rust-owned');

  seedLegacyCache(appDir);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const secondServer = await startServer(appDir, 4333);
  try {
    const response = await fetch('http://127.0.0.1:4333/conformance');
    assert.equal(response.status, 200, 'second flashpack start must serve the conformance route');
  } finally {
    await stopServer(secondServer.child);
  }
  assertLegacyCacheRemoved(appDir);

  const secondState = readJson(statePath);
  const secondStartManifest = readJson(startManifestPath);
  assert(
    secondState.generated_at_ms > firstState.generated_at_ms,
    'second start should refresh .flash/state/latest.json timestamp'
  );
  assert(
    secondStartManifest.generated_at_ms > firstStartManifest.generated_at_ms,
    'second start should refresh .flash/runtime/start-manifest.json timestamp'
  );
}

async function main() {
  const appDir = path.join(tempRoot, 'fixture');
  fs.rmSync(tempRoot, { recursive: true, force: true });
  copyFixture(fixtureRoot, appDir);

  log('verifying build-state reuse');
  await verifyBuildReuse(appDir);

  log('verifying start-state reuse');
  await verifyStartReuse(appDir);

  log('all checks passed');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
