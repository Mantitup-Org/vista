#!/usr/bin/env node

/**
 * Flight RSC/SSR contract tests:
 *  - Inline Flight bootstrap in first HTML (__VISTA_RSC_DATA__)
 *  - Client entry hydrates from inline payload (no createFromFetch on first load)
 *  - Missing / stub SSR manifest fails closed (no renderToString page HTML)
 *  - Dev path uses React.use(Flight) for streaming
 *  - --legacy island SSR is rejected by the CLI
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { spawnWithFallback } = require('./fixtures/spawn-utils.cjs');

const repoRoot = path.resolve(__dirname, '..');
const vistaSrc = path.join(repoRoot, 'packages', 'vista', 'src');
const vistaBin = path.join(repoRoot, 'packages', 'vista', 'bin', 'vista.js');
const tscPath = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const fixtureRoot = path.join(repoRoot, 'bench', 'basic-app');
const RSC_DATA_FLAG = '__VISTA_RSC_DATA__';

function log(message) {
  console.log(`[test:flight-ssr] ${message}`);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

async function runNode(args, options = {}) {
  return await new Promise(async (resolve, reject) => {
    let child;
    try {
      child = await spawnWithFallback(process.execPath, args, {
        cwd: options.cwd || repoRoot,
        env: { ...process.env, ...(options.env || {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timed out: node ${args.join(' ')}`));
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
      resolve({ code, stdout, stderr });
    });
  });
}

function copyDir(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.vista' || entry.name === '.flash') {
      continue;
    }
    const from = path.join(sourceDir, entry.name);
    const to = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

async function waitForReady(url, child, timeoutMs = 90000) {
  const started = Date.now();
  let lastStatus = null;
  let lastBody = '';
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early (${child.exitCode}) before ${url}`);
    }
    try {
      const response = await fetch(url, { cache: 'no-store' });
      lastStatus = response.status;
      lastBody = await response.text();
      // Wait until Flight SSR succeeds (inline payload present) or we have a
      // definitive fail-closed error page — not a transient boot 5xx.
      if (
        response.status === 200 &&
        lastBody.includes(RSC_DATA_FLAG)
      ) {
        return { status: response.status, body: lastBody };
      }
      if (
        response.status >= 500 &&
        /Flight SSR is unavailable|no longer falls back to renderToString/i.test(lastBody)
      ) {
        return { status: response.status, body: lastBody };
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(
    `Timed out waiting for ready ${url} (lastStatus=${lastStatus})\n${lastBody.slice(0, 1000)}`
  );
}

async function waitForUrl(url, child, timeoutMs = 90000) {
  return waitForReady(url, child, timeoutMs);
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
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function assertSourceContracts() {
  log('Checking source contracts…');
  const engine = read(path.join(vistaSrc, 'server', 'rsc-engine.ts'));
  const buildRsc = read(path.join(vistaSrc, 'bin', 'build-rsc.ts'));
  const cli = read(vistaBin);
  const flashpackServer = read(path.join(vistaSrc, 'server', 'rsc-engine-flashpack.ts'));
  const flashpackCommand = read(path.join(vistaSrc, 'flashpack', 'command.ts'));

  assert.match(engine, /teeFlightReadable/, 'rsc-engine must tee Flight for inline hydrate');
  assert.match(engine, /buildInlineFlightBootstrapScript/, 'rsc-engine must inject inline Flight bootstrap');
  assert.match(engine, /RSC_DATA_FLAG/, 'rsc-engine must inject RSC_DATA_FLAG inline Flight bootstrap');
  assert.match(
    read(path.join(vistaSrc, 'constants.ts')),
    new RegExp(`${RSC_DATA_FLAG}`),
    'constants must define __VISTA_RSC_DATA__'
  );
  assert.match(
    engine,
    /React\.use\(flightResponse/,
    'rsc-engine must use React.use(Flight) in both dev and prod for streaming'
  );
  assert.match(
    engine,
    /no longer falls back to renderToString/,
    'rsc-engine must fail closed instead of renderToString'
  );
  assert.doesNotMatch(
    engine,
    /Legacy Fallback: Direct renderToString/,
    'rsc-engine must not retain the legacy renderToString page path'
  );
  assert.doesNotMatch(
    engine,
    /import \{[^}]*renderToString/,
    'rsc-engine must not import renderToString'
  );

  assert.match(buildRsc, /createFromReadableStream/, 'client entry must hydrate from ReadableStream');
  assert.match(buildRsc, /RSC_DATA_FLAG/, 'client entry must read inline Flight global via RSC_DATA_FLAG');
  assert.match(
    buildRsc,
    /First load no longer refetches \/rsc/,
    'client entry must refuse first-load /rsc refetch when inline is missing'
  );
  // Initial hydrate path must not call createFromFetch — navigation still may via rsc-router.
  const hydrateSection = buildRsc.slice(
    buildRsc.indexOf('function generateRSCClientEntry'),
    buildRsc.indexOf('function syncReactServerManifests')
  );
  assert.doesNotMatch(
    hydrateSection,
    /createFromFetch/,
    'generated client entry must not createFromFetch on first load'
  );

  assert.match(cli, /--legacy \/ VISTA_LEGACY island SSR has been removed/, 'CLI must reject --legacy');
  assert.doesNotMatch(cli, /Start dev server with legacy SSR/, 'CLI help must not advertise --legacy');

  assert.match(
    flashpackServer,
    /Same Flight SSR contract as webpack/,
    'Flashpack server must document Flight SSR parity'
  );
  assert.match(
    flashpackCommand,
    /not renderToString/,
    'Flashpack fallback must be explicit webpack Flight, not renderToString'
  );
}

async function assertLegacyRejected() {
  log('Checking --legacy is rejected…');
  const result = await runNode([vistaBin, 'dev', '--legacy'], {
    cwd: repoRoot,
    timeoutMs: 15000,
    env: { ...process.env, PORT: '3991' },
  });
  assert.notEqual(result.code, 0, '--legacy must exit non-zero');
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /legacy.*removed|island SSR has been removed/i,
    '--legacy rejection message missing'
  );
}

async function assertRuntimeInlineFlight() {
  log('Building vista dist…');
  const buildDist = await runNode([tscPath, '-p', path.join('packages', 'vista', 'tsconfig.json')], {
    cwd: repoRoot,
    timeoutMs: 180000,
  });
  assert.equal(buildDist.code, 0, `vista tsc failed:\n${buildDist.stdout}\n${buildDist.stderr}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-flight-ssr-'));
  const appDir = path.join(tempDir, 'app');
  copyDir(fixtureRoot, appDir);

  // Point the fixture at the local vista package.
  const pkg = JSON.parse(read(path.join(appDir, 'package.json')));
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies.vista = `file:${path.join(repoRoot, 'packages', 'vista')}`;
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(pkg, null, 2));

  log('Building basic-app fixture…');
  const buildApp = await runNode([vistaBin, 'build'], {
    cwd: appDir,
    timeoutMs: 240000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      VISTA_ENGINE: 'default',
      VISTA_FLASHPACK: 'false',
    },
  });
  assert.equal(buildApp.code, 0, `fixture build failed:\n${buildApp.stdout}\n${buildApp.stderr}`);

  const clientEntry = path.join(appDir, '.vista', 'rsc-client.tsx');
  if (fs.existsSync(clientEntry)) {
    const entrySource = read(clientEntry);
    assert.match(entrySource, /createFromReadableStream/);
    assert.doesNotMatch(entrySource, /createFromFetch\(/);
    assert.match(entrySource, new RegExp(RSC_DATA_FLAG));
  } else {
    // Client entry is compiled into static chunks; also check source template survived build.
    const staticDir = path.join(appDir, '.vista', 'static');
    assert.ok(fs.existsSync(staticDir), 'expected .vista/static after production build');
  }

  const port = 4417 + Math.floor(Math.random() * 200);
  log(`Starting production server on ${port}…`);
  let child;
  let serverLog = '';
  try {
    child = await spawnWithFallback(process.execPath, [vistaBin, 'start'], {
      cwd: appDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        VISTA_ENGINE: 'default',
        VISTA_FLASHPACK: 'false',
        VISTA_DEBUG: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (error) {
    throw error;
  }

  child.stdout.on('data', (chunk) => {
    serverLog += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    serverLog += chunk.toString();
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const ready = await waitForReady(baseUrl + '/', child, 120000);
    const htmlResponse = await fetch(baseUrl + '/', { cache: 'no-store' });
    const html = await htmlResponse.text();
    assert.equal(
      htmlResponse.status,
      200,
      `expected 200 HTML, got ${htmlResponse.status}\n${html}\n--- server log ---\n${serverLog}\n--- first ready status ${ready.status} ---`
    );
    assert.match(html, new RegExp(`window\\.${RSC_DATA_FLAG}=`), 'first HTML must include inline Flight');
    assert.doesNotMatch(
      html,
      /no longer falls back to renderToString/,
      'successful HTML must not be the fail-closed error page'
    );

    // Fail-closed: wipe SSR manifest and restart — must not emit renderToString HTML.
    log('Probing fail-closed missing manifest…');
    await stopServer(child);
    child = null;

    const manifestPath = path.join(appDir, '.vista', 'react-server-manifest.json');
    const legacyManifestPath = path.join(appDir, '.vista', 'react-ssr-manifest.json');
    fs.writeFileSync(manifestPath, '{}');
    if (fs.existsSync(legacyManifestPath)) {
      fs.writeFileSync(legacyManifestPath, '{}');
    }

    child = await spawnWithFallback(process.execPath, [vistaBin, 'start'], {
      cwd: appDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        VISTA_ENGINE: 'default',
        VISTA_FLASHPACK: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.on('data', (chunk) => {
      serverLog += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      serverLog += chunk.toString();
    });

    const failResponse = await waitForReady(baseUrl + '/', child, 60000);
    const failBody = failResponse.body;
    assert.notEqual(failResponse.status, 200, 'stub manifest must not serve successful page HTML');
    assert.match(
      failBody,
      /Flight SSR is unavailable|react-server-manifest|no longer falls back to renderToString/i,
      `fail-closed body missing expected message:\n${failBody}\n--- server log ---\n${serverLog}`
    );
    assert.doesNotMatch(
      failBody,
      new RegExp(`window\\.${RSC_DATA_FLAG}=`),
      'fail-closed response must not pretend to be Flight HTML'
    );
  } finally {
    await stopServer(child);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }

  if (serverLog.includes('EADDRINUSE')) {
    throw new Error(`Port conflict during flight SSR test:\n${serverLog}`);
  }
}

async function main() {
  assertSourceContracts();
  await assertLegacyRejected();
  await assertRuntimeInlineFlight();
  log('All Flight SSR checks passed.');
}

main().catch((error) => {
  console.error('[test:flight-ssr] FAILED:', error && error.stack ? error.stack : error);
  process.exit(1);
});
