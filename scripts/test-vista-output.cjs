#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const vistaBin = path.join(repoRoot, 'packages', 'vista', 'bin', 'vista.js');
const tscPath = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const fixtureRoot = path.join(repoRoot, 'bench', 'app-router-server');
const tempRoot = path.join(repoRoot, '.tmp', 'test-vista-output');

const EXCLUDED_DIRECTORIES = new Set(['.git', '.vista', '.flash', 'node_modules']);

function log(message) {
  console.log(`[test:vista-output] ${message}`);
}

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

async function buildVistaPackageDist() {
  await runNode([tscPath, '-p', path.join('packages', 'vista', 'tsconfig.json')], {
    cwd: repoRoot,
    timeoutMs: 300000,
  });
}

async function startServer(appDir, variant, port) {
  const child = spawn(
    process.execPath,
    [vistaBin, 'start', '--engine', variant],
    {
      cwd: appDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  );

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

function readJson(absolutePath) {
  return JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
}

async function verifyVariant(variant, port) {
  const appDir = path.join(tempRoot, variant);
  fs.rmSync(appDir, { recursive: true, force: true });
  copyFixture(fixtureRoot, appDir);

  log(`building ${variant}`);
  await runNode([vistaBin, 'build', '--engine', variant], { cwd: appDir, timeoutMs: 300000 });

  const vistaDir = path.join(appDir, '.vista');
  const runtimeManifestPath = path.join(vistaDir, 'server', 'runtime-manifest.json');
  const fileTracePath = path.join(vistaDir, 'server', 'file-trace.json');
  const standaloneServerPath = path.join(vistaDir, 'standalone', 'server.js');
  const serverManifestPath = path.join(vistaDir, 'server', 'server-manifest.json');
  const requiredServerFilesPath = path.join(vistaDir, 'required-server-files.json');
  const reactClientManifestPath = path.join(vistaDir, 'react-client-manifest.json');
  const reactServerManifestPath = path.join(vistaDir, 'react-server-manifest.json');
  const prerenderManifestPath = path.join(vistaDir, 'prerender-manifest.json');
  const cacheManifestPath = path.join(vistaDir, 'cache', 'cache-manifest.json');
  const imageManifestPath = path.join(vistaDir, 'cache', 'images', 'manifest.json');
  const mediaManifestPath = path.join(vistaDir, 'static', 'media', 'media-manifest.json');
  const pprShellArtifactPath = path.join(vistaDir, 'static', 'pages', 'conformance', 'ppr.shell.html');
  const flashDir = path.join(appDir, '.flash');

  assert(fs.existsSync(runtimeManifestPath), 'missing runtime-manifest.json');
  assert(fs.existsSync(fileTracePath), 'missing file-trace.json');
  assert(fs.existsSync(standaloneServerPath), 'missing standalone/server.js');
  assert(fs.existsSync(cacheManifestPath), 'missing cache/cache-manifest.json');
  assert(fs.existsSync(imageManifestPath), 'missing cache/images/manifest.json');
  assert(fs.existsSync(mediaManifestPath), 'missing static/media/media-manifest.json');

  const runtimeManifest = readJson(runtimeManifestPath);
  const fileTrace = readJson(fileTracePath);
  const serverManifest = readJson(serverManifestPath);
  const requiredServerFiles = readJson(requiredServerFilesPath);
  const reactClientManifest = readJson(reactClientManifestPath);
  const reactServerManifest = fs.readFileSync(reactServerManifestPath, 'utf-8');
  const prerenderManifest = readJson(prerenderManifestPath);
  const cacheManifest = readJson(cacheManifestPath);
  const imageManifest = readJson(imageManifestPath);
  const mediaManifest = readJson(mediaManifestPath);
  const pprShellArtifact = fs.readFileSync(pprShellArtifactPath, 'utf-8');

  assert.equal(runtimeManifest.schemaVersion, 1, 'runtime manifest schema mismatch');
  assert.equal(fileTrace.schemaVersion, 1, 'file trace schema mismatch');
  assert.equal(cacheManifest.schemaVersion, 1, 'cache manifest schema mismatch');
  assert.equal(imageManifest.schemaVersion, 1, 'image manifest schema mismatch');
  assert.equal(mediaManifest.schemaVersion, 1, 'media manifest schema mismatch');
  assert(Array.isArray(fileTrace.copiedFiles) && fileTrace.copiedFiles.length > 0, 'file trace is empty');
  assert.equal(imageManifest.endpoint, '/_vista/image', 'image manifest must expose Vista image endpoint');
  assert.equal(mediaManifest.mediaDirectory, '.vista/static/media', 'media manifest must point to static/media');
  assert(
    String(requiredServerFiles.appDir).includes(path.join('.vista', 'standalone', 'project')),
    'required-server-files appDir must point to standalone project'
  );
  assert(
    serverManifest.routes.every((route) =>
      String(route.pagePath).includes(path.join('.vista', 'standalone', 'project', 'app'))
    ),
    'server manifest routes must point to standalone app files'
  );
  assert(
    reactServerManifest.includes(path.join('.vista', 'standalone', 'project').replace(/\\/g, '/')),
    'react-server-manifest must point at the standalone project snapshot'
  );
  assert(
    reactServerManifest.includes(path.join('.vista', 'standalone', 'runtime', 'vista').replace(/\\/g, '/')),
    'react-server-manifest must point at the standalone Vista runtime snapshot'
  );
  assert(
    !reactServerManifest.includes(path.join(appDir, 'app').replace(/\\/g, '/')),
    'react-server-manifest still points at the original app source tree'
  );
  assert(
    !reactServerManifest.includes('packages/vista/dist'),
    'react-server-manifest still points at the original framework dist tree'
  );
  const reactClientKeys = Object.keys(reactClientManifest).map((key) => decodeURI(key));
  assert(
    reactClientKeys.some((key) => key.endsWith('/app/conformance/error.js#default')),
    'react-client-manifest must include default-export aliases for standalone app client boundaries'
  );
  assert(
    reactClientKeys.some((key) => key.endsWith('/runtime/vista/components/error-boundary.js#RouteErrorBoundary')),
    'react-client-manifest must include named-export aliases for standalone runtime client boundaries'
  );
  assert(fs.existsSync(pprShellArtifactPath), 'missing PPR shell artifact for /conformance/ppr');
  assert(
    pprShellArtifact.includes('window.__VISTA_PPR_RESUME__'),
    'PPR shell artifact must embed resume bootstrap metadata'
  );
  assert(
    pprShellArtifact.includes('window.__VISTA_RUNTIME_TRACE__'),
    'PPR shell artifact must initialize runtime tracing for advanced runtime flows'
  );
  assert(
    pprShellArtifact.includes('window.__VISTA_RSC_ROUTER__'),
    'PPR shell artifact must prefer the client RSC router resume bridge when available'
  );
  assert(
    pprShellArtifact.includes('vista:rsc-router-ready'),
    'PPR shell artifact must listen for the RSC router readiness event'
  );
  assert(
    pprShellArtifact.includes('vista:ppr-complete'),
    'PPR shell artifact must emit completion events for resume flows'
  );
  assert(
    pprShellArtifact.includes('vista:ppr-error'),
    'PPR shell artifact must emit error events for resume flows'
  );
  assert(
    pprShellArtifact.includes('vista:rsc-resume-complete'),
    'PPR shell artifact must react to client-side RSC resume completion events'
  );
  assert.equal(
    prerenderManifest.routes['/conformance/ppr']?.ppr?.enabled,
    true,
    'prerender-manifest must mark /conformance/ppr as partially prerendered'
  );
  assert.equal(
    prerenderManifest.routes['/conformance/ppr']?.ppr?.strategy,
    'loading-boundary',
    'prerender-manifest must record the PPR shell strategy'
  );
  assert.equal(
    prerenderManifest.routes['/conformance/ppr']?.ppr?.resumePath,
    '/conformance/ppr',
    'prerender-manifest must record the PPR resume path'
  );

  if (variant === 'flashpack') {
    const buildManifestPath = path.join(flashDir, 'runtime', 'build-manifest.json');
    const latestStatePath = path.join(flashDir, 'state', 'latest.json');
    const buildGraphPath = path.join(flashDir, 'graph', 'build-rust.json');
    assert(fs.existsSync(buildManifestPath), 'missing .flash/runtime/build-manifest.json');
    assert(fs.existsSync(latestStatePath), 'missing .flash/state/latest.json');
    assert(fs.existsSync(buildGraphPath), 'missing .flash/graph/build-rust.json');
    assert(!fs.existsSync(path.join(flashDir, 'turbo')), '.flash/turbo should not be generated');
    assert(
      !fs.existsSync(path.join(flashDir, 'cache', 'turbo')),
      '.flash/cache/turbo should not be generated'
    );

    const buildManifest = readJson(buildManifestPath);
    const latestState = readJson(latestStatePath);
    assert.equal(buildManifest.pipeline_owner, 'rust-cli', 'flashpack build must be owned by rust-cli');
    assert.equal(buildManifest.phase, 'build', 'flashpack build manifest must record build phase');
    assert.equal(latestState.pipeline_owner, 'rust-cli', 'flashpack latest state must be rust-owned');
    assert.equal(latestState.command, 'run', 'flashpack latest state must reflect a rust-run command');
    assert.equal(cacheManifest.activeCacheRoot, '.flash/cache', 'flashpack cache manifest must point at .flash/cache');
  } else {
    assert.equal(
      cacheManifest.activeCacheRoot,
      '.vista/cache/webpack',
      'default cache manifest must point at .vista/cache/webpack'
    );
  }

  const hiddenAppDir = path.join(appDir, 'app.__hidden');
  fs.renameSync(path.join(appDir, 'app'), hiddenAppDir);

  const server = await startServer(appDir, variant, port);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/conformance`);
    const html = await response.text();
    assert.equal(response.status, 200, `unexpected status for ${variant} standalone start`);
    assert(
      html.includes('RSC conformance fixture'),
      `standalone runtime did not render the dynamic page for ${variant}`
    );

    if (variant === 'flashpack') {
      const startManifestPath = path.join(flashDir, 'runtime', 'start-manifest.json');
      assert(fs.existsSync(startManifestPath), 'missing .flash/runtime/start-manifest.json');
      const startManifest = readJson(startManifestPath);
      assert.equal(startManifest.pipeline_owner, 'rust-cli', 'flashpack start must be owned by rust-cli');
      assert.equal(startManifest.phase, 'start', 'flashpack start manifest must record start phase');
    }
  } finally {
    await stopServer(server.child);
  }
}

async function main() {
  await buildVistaPackageDist();
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });

  await verifyVariant('default', 4310);
  await verifyVariant('flashpack', 4311);

  log('all checks passed');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
