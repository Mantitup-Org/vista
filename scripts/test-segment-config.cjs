#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');
const { spawnWithFallback } = require('./fixtures/spawn-utils.cjs');

const repoRoot = path.resolve(__dirname, '..');
const validFixtureDir = path.join(repoRoot, 'bench', 'app-router-server');
const invalidFixturesRoot = path.join(repoRoot, 'scripts', 'fixtures', 'segment-validation');
const vistaCli = path.join(repoRoot, 'packages', 'vista', 'bin', 'vista.js');
const tscPath = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const READY_REGEX = /Ready in/i;
const LOCAL_URL_REGEX = /Local:\s*(?<url>https?:\/\/[^\s]+)/i;

async function runCommand(command, args, options) {
  return await new Promise(async (resolve, reject) => {
    let child;
    try {
      child = await spawnWithFallback(command, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(
            `Command failed: ${command} ${args.join(' ')} (code=${code}, signal=${signal || 'none'})\n${stdout}\n${stderr}`
          )
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function buildVistaPackageDist() {
  await runCommand(process.execPath, [tscPath, '-p', path.join('packages', 'vista', 'tsconfig.json')], {
    cwd: repoRoot,
    env: process.env,
  });
}

async function buildValidFixture(engineVariant) {
  await fs.promises.rm(path.join(validFixtureDir, '.vista'), { recursive: true, force: true });
  await fs.promises.rm(path.join(validFixtureDir, '.flash'), { recursive: true, force: true });

  await runCommand(process.execPath, [vistaCli, 'build', '--engine', engineVariant], {
    cwd: validFixtureDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;

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

  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function startServer(engineVariant, port) {
  const upstreamPort = port + 200;
  const child = await spawnWithFallback(process.execPath, [vistaCli, 'start', '--engine', engineVariant], {
    cwd: validFixtureDir,
    env: {
      ...process.env,
      PORT: String(port),
      RSC_UPSTREAM_PORT: String(upstreamPort),
      NODE_ENV: 'production',
      VISTA_DEBUG: '1',
      VISTA_SEGMENT_FETCH_BASE_URL: process.env.VISTA_SEGMENT_FETCH_BASE_URL || 'http://127.0.0.1:5999',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let output = '';
  let localUrl = `http://localhost:${port}`;
  let serverReady = false;
  let upstreamReady = false;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${engineVariant} segment-config server\n${output}`));
    }, 120000);

    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(LOCAL_URL_REGEX);
      if (match?.groups?.url) {
        localUrl = match.groups.url.trim();
      }
      if (READY_REGEX.test(output)) {
        serverReady = true;
      }
      if (output.includes('[vista:rsc:upstream] Listening on')) {
        upstreamReady = true;
      }
      if (serverReady && upstreamReady) {
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Segment-config server exited before ready (${engineVariant}) code=${code} signal=${signal || 'none'}\n${output}`
        )
      );
    });
  });

  return { child, baseUrl: localUrl };
}

async function startCounterServer(port = 5999) {
  const counters = new Map();
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (requestUrl.pathname !== '/segment-fetch') {
      res.statusCode = 404;
      res.end('not-found');
      return;
    }

    const bucket = requestUrl.searchParams.get('bucket') || 'default';
    const nextValue = (counters.get(bucket) || 0) + 1;
    counters.set(bucket, nextValue);

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ bucket, value: nextValue }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  return {
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function fetchHtml(baseUrl, routePath) {
  const response = await fetch(`${baseUrl}${routePath}`, { cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${routePath}\n${text}`);
  }
  return text.replace(/<!-- -->/g, '');
}

async function fetchJson(baseUrl, routePath) {
  const response = await fetch(`${baseUrl}${routePath}`, { cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${routePath}\n${text}`);
  }
  return JSON.parse(text);
}

function assertIncludes(text, expected, label) {
  assert(text.includes(expected), `Expected ${label} to include "${expected}" but received:\n${text}`);
}

function extractNumericMarker(html, marker) {
  const match = html.match(new RegExp(`${marker}:(\\d+)`));
  assert(match, `Expected HTML to contain numeric marker for ${marker} but received:\n${html}`);
  return Number.parseInt(match[1], 10);
}

function loadServerManifest() {
  const manifestPath = path.join(validFixtureDir, '.vista', 'server', 'server-manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function assertManifestRouteConfig() {
  const manifest = loadServerManifest();
  const route = manifest.routes.find((entry) => entry.pattern === '/conformance/segment-config/manifest');
  assert(route, 'Expected /conformance/segment-config/manifest route in server manifest');
  assert.equal(route.segmentConfig.runtime, 'nodejs');
  assert.deepEqual(route.segmentConfig.preferredRegion, ['home', 'global']);
  assert.equal(route.segmentConfig.maxDuration, 7);
  assert.equal(route.segmentConfig.fetchCache, 'default-cache');
  assert.equal(route.segmentConfig.dynamic, 'force-static');
  assert.equal(route.revalidate, 15);
  assert.equal(route.renderMode, 'static');
}

async function assertFetchPolicyPages(baseUrl) {
  const firstCache = await fetchHtml(baseUrl, '/conformance/segment-config/fetch-cache');
  const firstCacheValue = extractNumericMarker(firstCache, 'fetch-cache');
  const secondCache = await fetchHtml(baseUrl, '/conformance/segment-config/fetch-cache');
  const secondCacheValue = extractNumericMarker(secondCache, 'fetch-cache');
  assert.equal(
    secondCacheValue,
    firstCacheValue,
    `Expected cached fetch route to stay stable across requests but received ${firstCacheValue} -> ${secondCacheValue}`
  );

  const firstNoStore = await fetchHtml(baseUrl, '/conformance/segment-config/fetch-no-store');
  const firstNoStoreValue = extractNumericMarker(firstNoStore, 'fetch-no-store');
  const secondNoStore = await fetchHtml(baseUrl, '/conformance/segment-config/fetch-no-store');
  const secondNoStoreValue = extractNumericMarker(secondNoStore, 'fetch-no-store');
  assert(
    secondNoStoreValue > firstNoStoreValue,
    `Expected no-store fetch route to advance across requests but received ${firstNoStoreValue} -> ${secondNoStoreValue}`
  );
}

async function assertInvalidBuildFails(fixtureName, expectedSnippet) {
  const fixtureDir = path.join(invalidFixturesRoot, fixtureName);

  let failed = false;
  try {
    await runCommand(process.execPath, [vistaCli, 'build'], {
      cwd: fixtureDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
    });
  } catch (error) {
    failed = true;
    const message = error && error.message ? error.message : String(error);
    assert(
      message.includes(expectedSnippet),
      `Expected invalid fixture ${fixtureName} to include "${expectedSnippet}" but received:\n${message}`
    );
  }

  assert(failed, `Expected invalid fixture ${fixtureName} to fail the build`);
}

async function runValidFixtureChecks(engineVariant, port) {
  await buildValidFixture(engineVariant);
  assertManifestRouteConfig();

  const server = await startServer(engineVariant, port);
  try {
    const manifestPage = await fetchHtml(server.baseUrl, '/conformance/segment-config/manifest');
    assertIncludes(manifestPage, 'segment-config-manifest', '/conformance/segment-config/manifest');
    await assertFetchPolicyPages(server.baseUrl);
    const edgeApiPayload = await fetchJson(server.baseUrl, '/conformance/api-edge');
    assert.equal(edgeApiPayload.ok, true);
    assert.equal(edgeApiPayload.runtime, 'edge');
    assert.equal(edgeApiPayload.pathname, '/conformance/api-edge');
  } finally {
    await stopServer(server.child);
  }
}

async function main() {
  await buildVistaPackageDist();
  const counterServer = await startCounterServer();
  try {
    await runValidFixtureChecks('default', 5101);
    await runValidFixtureChecks('flashpack', 5201);
  } finally {
    await counterServer.close();
  }

  await assertInvalidBuildFails(
    'invalid-client-server-api',
    'server-only APIs vista/server cannot be imported from a Client Component'
  );
  await assertInvalidBuildFails(
    'invalid-server-browser-module',
    'browser-only module import react-dom/client is not allowed in a Server Component'
  );
  await assertInvalidBuildFails(
    'invalid-edge-runtime',
    'runtime "edge" is not supported yet in Vista'
  );
  await assertInvalidBuildFails(
    'invalid-fetch-cache',
    'Invalid segment config export "fetchCache"'
  );

  console.log('Segment config and boundary validation passed.');
}

main().catch((error) => {
  console.error('Segment config and boundary validation failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
