#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureDir = path.join(repoRoot, 'bench', 'app-router-server');
const vistaCli = path.join(repoRoot, 'packages', 'vista', 'bin', 'vista.js');
const tscPath = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const READY_REGEX = /Ready in/i;
const LOCAL_URL_REGEX = /Local:\s*(?<url>https?:\/\/[^\s]+)/i;

function resolveFlightClient() {
  return require(
    require.resolve('react-server-dom-webpack/client', {
      paths: [path.join(repoRoot, 'packages', 'vista')],
    })
  );
}

function loadServerConsumerManifest() {
  const manifestPath = path.join(fixtureDir, '.vista', 'react-server-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return {
    moduleMap: manifest.moduleMap || {},
    serverModuleMap: manifest.serverModuleMap || {},
    moduleLoading: manifest.moduleLoading || {
      prefix: '/_vista/static/chunks/',
      crossOrigin: null,
    },
  };
}

function loadBuiltServerManifest() {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureDir, '.vista', 'server', 'server-manifest.json'), 'utf8')
  );
}

function normalizeRelativePath(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/');
}

function findBuiltActionId(serverManifest, options) {
  const relativePath = normalizeRelativePath(options.relativePath);
  for (const [actionId, actionEntry] of Object.entries(serverManifest.serverActions || {})) {
    const entryRelativePath = normalizeRelativePath(path.relative(fixtureDir, actionEntry.filePath));
    if (entryRelativePath !== relativePath && !entryRelativePath.endsWith(`/${relativePath}`)) {
      continue;
    }
    if (options.kind && actionEntry.kind !== options.kind) {
      continue;
    }
    if (options.exportName && actionEntry.exportName !== options.exportName) {
      continue;
    }
    return actionId;
  }

  throw new Error(
    `Unable to find built action id for ${relativePath} (${options.kind || 'any'}:${options.exportName || 'any'})`
  );
}

async function runCommand(command, args, options) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

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
  const child = spawn(process.execPath, [vistaCli, 'start', '--engine', engineVariant], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      PORT: String(port),
      RSC_UPSTREAM_PORT: String(upstreamPort),
      NODE_ENV: 'production',
      VISTA_DEBUG: '1',
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
      reject(new Error(`Timed out waiting for ${engineVariant} conformance server\n${output}`));
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
          `Conformance server exited before ready (${engineVariant}) code=${code} signal=${signal || 'none'}\n${output}`
        )
      );
    });
  });

  return { child, baseUrl: localUrl };
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}\n${text}`);
  }
  return text;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}\n${text}`);
  }
  return JSON.parse(text);
}

async function fetchJsonResponse(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}\n${text}`);
  }
  return {
    response,
    json: JSON.parse(text),
  };
}

async function fetchHtmlResponse(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: options.headers || {},
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}\n${text}`);
  }
  return { response, text };
}

async function assertPageContainsWithStatus(baseUrl, routePath, expectedSnippet, expectedStatus) {
  const response = await fetch(`${baseUrl}${routePath}`, { cache: 'no-store' });
  const text = await response.text();
  assert.equal(
    response.status,
    expectedStatus,
    `Expected ${routePath} to return ${expectedStatus} but received ${response.status}\n${text}`
  );
  const normalizedHtml = text.replace(/<!-- -->/g, '');
  assert(
    normalizedHtml.includes(expectedSnippet),
    `Expected ${routePath} to include "${expectedSnippet}" but received:\n${text}`
  );
}

async function invokeAction(baseUrl, routePath, actionId, args, serverConsumerManifest) {
  const { createFromFetch, encodeReply } = resolveFlightClient();
  const body = await encodeReply(args);
  const rawResponse = await fetch(`${baseUrl}/rsc${routePath}`, {
    method: 'POST',
    headers: {
      Accept: 'text/x-component',
      'rsc-action': actionId,
      ...(typeof body === 'string' ? { 'Content-Type': 'text/plain' } : {}),
    },
    body,
  });

  const debugResponse = rawResponse.clone();
  if (!rawResponse.ok) {
    throw new Error(
      `Action request failed (${rawResponse.status}) for ${routePath}\n${await debugResponse.text()}`
    );
  }

  try {
    return await createFromFetch(Promise.resolve(rawResponse), {
      serverConsumerManifest,
      callServer: async () => {
        throw new Error('Nested server action invocation is not expected in conformance tests.');
      },
    });
  } catch (error) {
    const debugBody = await debugResponse.text().catch(() => '');
    throw new Error(
      `Action decode failed for ${routePath}: ${(error && error.message) || error}\n${debugBody}`
    );
  }
}

async function buildVistaPackageDist() {
  await runCommand(process.execPath, [tscPath, '-p', path.join('packages', 'vista', 'tsconfig.json')], {
    cwd: repoRoot,
    env: process.env,
  });
}

async function buildFixture(engineVariant) {
  await fs.promises.rm(path.join(fixtureDir, '.vista'), { recursive: true, force: true });
  await fs.promises.rm(path.join(fixtureDir, '.flash'), { recursive: true, force: true });

  await runCommand(process.execPath, [vistaCli, 'build', '--engine', engineVariant], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });
}

async function assertPageContains(baseUrl, routePath, expectedSnippet) {
  const html = await fetchText(`${baseUrl}${routePath}`);
  const normalizedHtml = html.replace(/<!-- -->/g, '');
  assert(
    normalizedHtml.includes(expectedSnippet),
    `Expected ${routePath} to include "${expectedSnippet}" but received:\n${html}`
  );
}

async function assertPageTitle(baseUrl, routePath, expectedTitle) {
  const html = await fetchText(`${baseUrl}${routePath}`);
  assert(
    html.includes(`<title>${expectedTitle}</title>`),
    `Expected ${routePath} to include title "${expectedTitle}" but received:\n${html}`
  );
}

async function runEngineConformance(engineVariant, port) {
  await buildFixture(engineVariant);
  const serverConsumerManifest = loadServerConsumerManifest();
  const builtServerManifest = loadBuiltServerManifest();

  const server = await startServer(engineVariant, port);
  try {
    await assertPageContains(server.baseUrl, '/conformance/grouped', 'route-group-layout:');
    await assertPageContains(server.baseUrl, '/conformance/grouped', 'route-group-page');
    await assertPageContains(
      server.baseUrl,
      '/conformance/grouped-slots/dashboard',
      'grouped-slots-panel-page'
    );

    await assertPageContains(server.baseUrl, '/conformance/parallel', 'parallel-children-root');
    await assertPageContains(server.baseUrl, '/conformance/parallel', 'parallel-slot-root');
    await assertPageContains(server.baseUrl, '/conformance/parallel/branch', 'parallel-children-branch');
    await assertPageContains(server.baseUrl, '/conformance/parallel/branch', 'parallel-slot-branch');
    await assertPageContains(
      server.baseUrl,
      '/conformance/parallel/fallback',
      'parallel-children-fallback'
    );
    await assertPageContains(
      server.baseUrl,
      '/conformance/parallel/fallback',
      'parallel-slot-default'
    );

    await assertPageContains(server.baseUrl, '/conformance/interception', 'interception-children-root');
    await assertPageContains(server.baseUrl, '/conformance/interception', 'interception-slot-default');
    await assertPageContains(
      server.baseUrl,
      '/conformance/interception/details',
      'interception-children-details'
    );
    await assertPageContains(
      server.baseUrl,
      '/conformance/interception/details',
      'interception-slot-details'
    );

    await assertPageContains(
      server.baseUrl,
      '/conformance/nested-slots/nested',
      'nested-analytics-layout'
    );
    await assertPageContains(
      server.baseUrl,
      '/conformance/nested-slots/nested',
      'nested-analytics-summary-page'
    );
    await assertPageContains(
      server.baseUrl,
      '/conformance/nested-slots/nested',
      'nested-analytics-details-default'
    );

    await assertPageContains(server.baseUrl, '/conformance/with-loading', 'with-loading-slot-home');
    await assertPageContains(server.baseUrl, '/conformance/with-loading', 'with-loading-home');
    await assertPageContains(
      server.baseUrl,
      '/conformance/with-loading/foo',
      'with-loading-slot-foo'
    );
    await assertPageContains(
      server.baseUrl,
      '/conformance/with-loading/foo',
      'with-loading-foo'
    );

    const pprFullResponse = await fetchHtmlResponse(`${server.baseUrl}/conformance/ppr`);
    assert(
      pprFullResponse.text.replace(/<!-- -->/g, '').includes('ppr-page-content'),
      `Expected /conformance/ppr to include full page content but received:\n${pprFullResponse.text}`
    );
    assert.equal(
      pprFullResponse.response.headers.get('x-vista-prerender'),
      'PPR',
      'Expected PPR header on normal prerendered response'
    );
    assert.equal(
      pprFullResponse.response.headers.get('x-vista-prerender-strategy'),
      'loading-boundary',
      'Expected PPR strategy header on normal prerendered response'
    );
    assert.equal(
      pprFullResponse.response.headers.get('x-vista-route-runtime'),
      'nodejs',
      'Expected route runtime header on prerendered response'
    );

    const pprShellResponse = await fetchHtmlResponse(`${server.baseUrl}/conformance/ppr`, {
      headers: { 'x-vista-prerender': 'shell' },
    });
    const normalizedPprShellHtml = pprShellResponse.text.replace(/<!-- -->/g, '');
    assert(
      normalizedPprShellHtml.includes('ppr-loading-shell'),
      `Expected /conformance/ppr shell response to include loading shell but received:\n${pprShellResponse.text}`
    );
    assert(
      !normalizedPprShellHtml.includes('ppr-page-content'),
      `Expected /conformance/ppr shell response to exclude full page content but received:\n${pprShellResponse.text}`
    );
    assert.equal(
      pprShellResponse.response.headers.get('x-vista-prerender'),
      'SHELL',
      'Expected shell response header for PPR shell requests'
    );
    assert.equal(
      pprShellResponse.response.headers.get('x-vista-prerender-strategy'),
      'loading-boundary',
      'Expected shell response to include the PPR strategy header'
    );
    assert.equal(
      pprShellResponse.response.headers.get('x-vista-prerender-resume'),
      '/conformance/ppr',
      'Expected shell response to advertise the PPR resume path'
    );
    assert(
      normalizedPprShellHtml.includes('window.__VISTA_PPR_RESUME__'),
      'Expected PPR shell response to embed the resume bootstrap'
    );

    const pprResumeResponse = await fetchHtmlResponse(`${server.baseUrl}/conformance/ppr`, {
      headers: { 'x-vista-prerender': 'resume' },
    });
    const normalizedPprResumeHtml = pprResumeResponse.text.replace(/<!-- -->/g, '');
    assert(
      normalizedPprResumeHtml.includes('ppr-page-content'),
      `Expected /conformance/ppr resume response to include full page content but received:\n${pprResumeResponse.text}`
    );
    assert.equal(
      pprResumeResponse.response.headers.get('x-vista-prerender'),
      'RESUME',
      'Expected explicit resume response header for PPR resume requests'
    );
    assert.equal(
      pprResumeResponse.response.headers.get('x-vista-prerender-strategy'),
      'loading-boundary',
      'Expected resume response to include the PPR strategy header'
    );

    await assertPageContainsWithStatus(
      server.baseUrl,
      '/conformance/slot-boundaries',
      'slot-boundary-not-found',
      404
    );
    await assertPageContainsWithStatus(
      server.baseUrl,
      '/conformance/slot-boundaries/page-error',
      'slot-boundary-not-found',
      404
    );
    await assertPageContainsWithStatus(
      server.baseUrl,
      '/conformance/slot-boundaries/slot-error',
      'slot-boundary-not-found',
      404
    );

    await assertPageContains(server.baseUrl, '/conformance/actions-exported', 'exported-actions-ready');
    const exportedResult = await invokeAction(
      server.baseUrl,
      '/conformance/actions-exported',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'actions-exported', 'server-actions.js'),
        kind: 'module-export',
        exportName: 'exportedEcho',
      }),
      ['vista'],
      serverConsumerManifest
    );
    assert.equal(exportedResult.kind, 'exported');
    assert.equal(exportedResult.value, 'echo-vista');

    await assertPageContains(server.baseUrl, '/conformance/actions-inline', 'inline-actions-ready');
    const inlineResult = await invokeAction(
      server.baseUrl,
      '/conformance/actions-inline',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'actions-inline', 'page.js'),
        kind: 'inline',
        exportName: 'inlineEcho',
      }),
      ['vista'],
      serverConsumerManifest
    );
    assert.equal(inlineResult.kind, 'inline');
    assert.equal(inlineResult.value, 'echo-vista');

    await assertPageContains(server.baseUrl, '/conformance/cache-tag', 'cache-tag:0');
    await invokeAction(
      server.baseUrl,
      '/conformance/cache-tag',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'cache-tag', 'actions.js'),
        kind: 'module-export',
        exportName: 'resetTagCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/cache-tag', 'cache-tag:0');
    await invokeAction(
      server.baseUrl,
      '/conformance/cache-tag',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'cache-tag', 'actions.js'),
        kind: 'module-export',
        exportName: 'refreshTagCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/cache-tag', 'cache-tag:1');
    await invokeAction(
      server.baseUrl,
      '/conformance/cache-tag',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'cache-tag', 'actions.js'),
        kind: 'module-export',
        exportName: 'refreshTagCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/cache-tag', 'cache-tag:2');

    await assertPageContains(server.baseUrl, '/conformance/use-cache', 'use-cache:0');
    await invokeAction(
      server.baseUrl,
      '/conformance/use-cache',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'use-cache', 'actions.js'),
        kind: 'module-export',
        exportName: 'resetUseCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/use-cache', 'use-cache:0');
    await invokeAction(
      server.baseUrl,
      '/conformance/use-cache',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'use-cache', 'actions.js'),
        kind: 'module-export',
        exportName: 'refreshUseCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/use-cache', 'use-cache:1');
    await invokeAction(
      server.baseUrl,
      '/conformance/use-cache',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'use-cache', 'actions.js'),
        kind: 'module-export',
        exportName: 'refreshUseCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/use-cache', 'use-cache:2');

    await assertPageContains(server.baseUrl, '/conformance/use-cache-inline', 'use-cache-inline:0');
    await invokeAction(
      server.baseUrl,
      '/conformance/use-cache-inline',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'use-cache-inline', 'actions.js'),
        kind: 'module-export',
        exportName: 'resetInlineUseCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/use-cache-inline', 'use-cache-inline:0');
    await invokeAction(
      server.baseUrl,
      '/conformance/use-cache-inline',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'use-cache-inline', 'actions.js'),
        kind: 'module-export',
        exportName: 'refreshInlineUseCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/use-cache-inline', 'use-cache-inline:1');
    await invokeAction(
      server.baseUrl,
      '/conformance/use-cache-inline',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'use-cache-inline', 'actions.js'),
        kind: 'module-export',
        exportName: 'refreshInlineUseCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/use-cache-inline', 'use-cache-inline:2');

    await assertPageContains(server.baseUrl, '/conformance/cache-path', 'cache-path:0');
    await invokeAction(
      server.baseUrl,
      '/conformance/cache-path',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'cache-path', 'actions.js'),
        kind: 'module-export',
        exportName: 'resetPathCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/cache-path', 'cache-path:0');
    await invokeAction(
      server.baseUrl,
      '/conformance/cache-path',
      findBuiltActionId(builtServerManifest, {
        relativePath: path.join('app', 'conformance', 'cache-path', 'actions.js'),
        kind: 'module-export',
        exportName: 'refreshPathCache',
      }),
      [],
      serverConsumerManifest
    );
    await assertPageContains(server.baseUrl, '/conformance/cache-path', 'cache-path:1');

    const apiResponse = await fetchJsonResponse(`${server.baseUrl}/conformance/api`);
    assert.equal(apiResponse.json.ok, true);
    assert.equal(apiResponse.json.from, 'conformance-route');
    assert.equal(
      apiResponse.response.headers.get('x-vista-route-runtime'),
      'nodejs',
      'Expected route runtime header on node route handler responses'
    );
    assert.equal(
      apiResponse.response.headers.get('x-vista-advanced-runtime'),
      'route-handler',
      'Expected advanced runtime header on node route handler responses'
    );

    const edgeApiResponse = await fetchJsonResponse(`${server.baseUrl}/conformance/api-edge`);
    assert.equal(edgeApiResponse.json.ok, true);
    assert.equal(edgeApiResponse.json.from, 'conformance-edge-route');
    assert.equal(edgeApiResponse.json.runtime, 'edge');
    assert.equal(edgeApiResponse.json.pathname, '/conformance/api-edge');
    assert.equal(
      edgeApiResponse.response.headers.get('x-vista-route-runtime'),
      'edge',
      'Expected route runtime header on edge route handler responses'
    );
    assert.equal(
      edgeApiResponse.response.headers.get('x-vista-advanced-runtime'),
      'route-handler',
      'Expected advanced runtime header on edge route handler responses'
    );

    await assertPageContains(
      server.baseUrl,
      '/conformance/example-slug',
      'Dynamic slug: example-slug'
    );
    await assertPageTitle(server.baseUrl, '/conformance/example-slug', 'Conformance example-slug');
  } finally {
    await stopServer(server.child);
  }
}

async function main() {
  await buildVistaPackageDist();
  await runEngineConformance('default', 4701);
  await runEngineConformance('flashpack', 4801);
  console.log('RSC conformance verification passed.');
}

main().catch((error) => {
  console.error('RSC conformance verification failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
