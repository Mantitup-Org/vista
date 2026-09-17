#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function registerTypeScriptRuntime() {
  const searchRoots = [repoRoot, path.join(repoRoot, 'packages', 'vista')];
  const resolveFromWorkspace = (specifier) => {
    for (const root of searchRoots) {
      try {
        return require.resolve(specifier, { paths: [root] });
      } catch {}
    }

    throw new Error(`Unable to resolve ${specifier}`);
  };

  try {
    require(resolveFromWorkspace('@swc-node/register'));
    return;
  } catch {}

  try {
    require(resolveFromWorkspace('ts-node/register/transpile-only'));
    return;
  } catch {}

  try {
    require(resolveFromWorkspace('ts-node')).register({
      transpileOnly: true,
      compilerOptions: {
        module: 'commonjs',
        jsx: 'react-jsx',
        moduleResolution: 'node16',
        esModuleInterop: true,
      },
    });
    return;
  } catch {}

  throw new Error('No TypeScript runtime found for server runtime tests.');
}

registerTypeScriptRuntime();

const { runWithRequestContext } = require(path.join(
  repoRoot,
  'packages',
  'vista',
  'src',
  'server',
  'request-context.ts'
));
const serverApi = require(path.join(
  repoRoot,
  'packages',
  'vista',
  'src',
  'server',
  'index.ts'
));
const cacheApi = require(path.join(
  repoRoot,
  'packages',
  'vista',
  'src',
  'server',
  'cache.ts'
));
const actionRuntime = require(path.join(
  repoRoot,
  'packages',
  'vista',
  'src',
  'server',
  'runtime-actions.ts'
));
actionRuntime.configureServerReferenceRegistration((reference, id, exportName) => {
  reference.$$typeof = Symbol.for('react.server.reference');
  reference.$$id = `${id}#${exportName}`;
});
const { installModuleCompileHook } = require(path.join(
  repoRoot,
  'packages',
  'vista',
  'src',
  'server',
  'module-compile-hook.ts'
));
const staticCache = require(path.join(
  repoRoot,
  'packages',
  'vista',
  'src',
  'server',
  'static-cache.ts'
));

function createMockReq(overrides = {}) {
  const headers = { ...(overrides.headers || {}) };
  return {
    headers,
    method: overrides.method || 'GET',
    path: overrides.path || '/',
    originalUrl: overrides.originalUrl || overrides.path || '/',
    url: overrides.url || overrides.path || '/',
    query: overrides.query || {},
    protocol: overrides.protocol || 'http',
    get(name) {
      return headers[String(name).toLowerCase()] || headers[name] || undefined;
    },
    ...overrides,
  };
}

function createMockRes() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: undefined,
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    type(value) {
      this.setHeader('content-type', value);
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
  };
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(repoRoot, '.tmp-server-runtime-'));

  try {
    const req = createMockReq({
      path: '/docs',
      headers: {
        cookie: 'session=abc123',
        'x-test': 'header-value',
      },
    });
    const res = createMockRes();

    await runWithRequestContext(
      {
        req,
        res,
        cwd: repoRoot,
        vistaDirRoot: tempDir,
        urlPath: '/docs',
      },
      async () => {
        assert.equal(serverApi.cookies().get('session')?.value, 'abc123');
        assert.equal(serverApi.headers().get('x-test'), 'header-value');
        assert.equal(serverApi.draftMode().isEnabled, false);

        serverApi.draftMode().enable();
        assert.equal(serverApi.draftMode().isEnabled, true);

        serverApi.draftMode().disable();
        assert.equal(serverApi.draftMode().isEnabled, false);

        const setCookieHeader = res.getHeader('set-cookie');
        assert(Array.isArray(setCookieHeader), 'Expected Set-Cookie header array');
        assert.equal(setCookieHeader.length, 2);
      }
    );

    let executionCount = 0;
    const multiply = cacheApi.unstable_cache(
      async (value) => {
        executionCount++;
        return value * 2;
      },
      ['math', 'double'],
      { tags: ['math'], revalidate: 60 }
    );

    assert.equal(await multiply(4), 8);
    assert.equal(await multiply(4), 8);
    assert.equal(executionCount, 1, 'unstable_cache should reuse cached result');

    cacheApi.revalidateTag('math');
    assert.equal(await multiply(4), 8);
    assert.equal(executionCount, 2, 'revalidateTag should invalidate unstable_cache entries');

    const tempUseCacheProject = fs.mkdtempSync(path.join(repoRoot, '.tmp-use-cache-runtime-'));
    try {
      installModuleCompileHook({
        cwd: tempUseCacheProject,
        cacheComponentsEnabled: true,
      });

      const stateModulePath = path.join(tempUseCacheProject, 'use-cache-state.js');
      fs.writeFileSync(
        stateModulePath,
        [
          'let currentValue = 0;',
          'exports.readValue = function readValue() { return currentValue; };',
          'exports.bumpValue = function bumpValue() { currentValue += 1; return currentValue; };',
          '',
        ].join('\n'),
        'utf8'
      );

      const cachedModulePath = path.join(tempUseCacheProject, 'use-cache-module.js');
      fs.writeFileSync(
        cachedModulePath,
        [
          "'use cache';",
          `const { cacheLife, cacheTag } = require(${JSON.stringify(
            path.join(repoRoot, 'packages', 'vista', 'src', 'server', 'index.ts')
          )});`,
          "const { readValue } = require('./use-cache-state.js');",
          'exports.readCached = function readCached() {',
          "  cacheLife(30);",
          "  cacheTag('runtime-use-cache');",
          '  return { value: readValue() };',
          '};',
          '',
        ].join('\n'),
        'utf8'
      );

      delete require.cache[require.resolve(stateModulePath)];
      delete require.cache[require.resolve(cachedModulePath)];
      const stateModule = require(stateModulePath);
      const cachedModule = require(cachedModulePath);

      assert.deepEqual(cachedModule.readCached(), { value: 0 });
      stateModule.bumpValue();
      assert.deepEqual(
        cachedModule.readCached(),
        { value: 0 },
        'use cache should reuse the cached export result before invalidation'
      );
      cacheApi.revalidateTag('runtime-use-cache');
      assert.deepEqual(
        cachedModule.readCached(),
        { value: 1 },
        'revalidateTag should invalidate use cache export entries'
      );

      const inlineModulePath = path.join(tempUseCacheProject, 'use-cache-inline.js');
      fs.writeFileSync(
        inlineModulePath,
        [
          "const { cacheLife, cacheTag } = require(" +
            JSON.stringify(path.join(repoRoot, 'packages', 'vista', 'src', 'server', 'index.ts')) +
            ');',
          "const { readValue } = require('./use-cache-state.js');",
          'exports.readInlineCached = async function readInlineCached() {',
          '  async function loadValue() {',
          "    'use cache';",
          "    cacheLife(30);",
          "    cacheTag('runtime-inline-use-cache');",
          '    return { value: readValue() };',
          '  }',
          '  return loadValue();',
          '};',
          '',
        ].join('\n'),
        'utf8'
      );

      delete require.cache[require.resolve(inlineModulePath)];
      const inlineModule = require(inlineModulePath);
      assert.deepEqual(await inlineModule.readInlineCached(), { value: 1 });
      stateModule.bumpValue();
      assert.deepEqual(
        await inlineModule.readInlineCached(),
        { value: 1 },
        'inline use cache should reuse cached helper results before invalidation'
      );
      cacheApi.revalidateTag('runtime-inline-use-cache');
      assert.deepEqual(
        await inlineModule.readInlineCached(),
        { value: 2 },
        'revalidateTag should invalidate inline use cache helper entries'
      );
    } finally {
      fs.rmSync(tempUseCacheProject, { recursive: true, force: true });
    }

    const taggedPage = {
      html: '<html><body>tagged</body></html>',
      generatedAt: Date.now(),
      revalidate: 0,
      routePattern: '/blog',
      tags: ['article'],
    };
    staticCache.setCachedPage('/blog', taggedPage);
    staticCache.writeStaticPageToDisk(tempDir, '/blog', taggedPage);

    await runWithRequestContext(
      {
        cwd: repoRoot,
        vistaDirRoot: tempDir,
        urlPath: '/blog',
      },
      async () => {
        cacheApi.revalidateTag('article');
      }
    );

    assert.equal(staticCache.getCachedPage('/blog').page, null);
    assert.equal(
      fs.existsSync(path.join(tempDir, 'static', 'pages', 'blog.html')),
      false,
      'revalidateTag should remove static page artifacts'
    );

    const pathPage = {
      html: '<html><body>path</body></html>',
      generatedAt: Date.now(),
      revalidate: 0,
      routePattern: '/docs',
    };
    staticCache.setCachedPage('/docs', pathPage);
    staticCache.writeStaticPageToDisk(tempDir, '/docs', pathPage);

    await runWithRequestContext(
      {
        cwd: repoRoot,
        vistaDirRoot: tempDir,
        urlPath: '/docs',
      },
      async () => {
        cacheApi.revalidatePath('/docs');
      }
    );

    assert.equal(staticCache.getCachedPage('/docs').page, null);
    assert.equal(
      fs.existsSync(path.join(tempDir, 'static', 'pages', 'docs.html')),
      false,
      'revalidatePath should remove static page artifacts'
    );

    const tempProject = fs.mkdtempSync(
      path.join(repoRoot, 'node_modules', '.tmp-inline-actions-')
    );
    try {
      let clientProxyId;
      installModuleCompileHook({
        cwd: tempProject,
        createClientModuleProxy: (id) => {
          clientProxyId = id;
          return { clientReference: true };
        },
      });

      const clientModulePath = path.join(tempProject, 'client-boundary.js');
      fs.writeFileSync(
        clientModulePath,
        ["'use client';", 'module.exports = { client: true };', ''].join('\n'),
        'utf8'
      );
      delete require.cache[require.resolve(clientModulePath)];
      assert.deepEqual(
        require(clientModulePath),
        { clientReference: true },
        'Client boundaries under linked package node_modules paths should use a proxy'
      );
      assert.equal(clientProxyId, `file://${clientModulePath}`);

      const inlineModulePath = path.join(tempProject, 'inline-actions.js');
      fs.writeFileSync(
        inlineModulePath,
        [
          'exports.buildInlineAction = function buildInlineAction() {',
          "  async function inlineEcho(value) { 'use server'; return { kind: 'inline', value: `echo-${value}` }; }",
          '  return inlineEcho;',
          '};',
          '',
        ].join('\n'),
        'utf8'
      );

      delete require.cache[require.resolve(inlineModulePath)];
      const inlineModule = require(inlineModulePath);
      const inlineAction = inlineModule.buildInlineAction();
      const inlineActionId = actionRuntime.createInlineServerActionId(inlineModulePath, 0, 'inlineEcho');
      const registeredInlineAction = actionRuntime.resolveRegisteredServerReference(inlineActionId);
      if (!registeredInlineAction) {
        console.error('Inline action registration mismatch.');
        console.error(`  modulePath: ${inlineModulePath}`);
        console.error(`  actionId: ${inlineActionId}`);
        console.error(`  functionSource: ${inlineModule.buildInlineAction.toString()}`);
      }
      assert.equal(
        registeredInlineAction,
        inlineAction,
        'Inline action should be registered through the compile hook'
      );

      assert.equal(
        inlineAction.$$typeof,
        Symbol.for('react.server.reference'),
        'Inline action should be marked as a React server reference'
      );
      assert.equal(
        inlineAction.$$id,
        `${actionRuntime.createInlineServerActionId(inlineModulePath, 0, 'inlineEcho')}#inlineEcho`,
        'Inline action should use its registered server reference id'
      );

      const exportedModulePath = path.join(tempProject, 'exported-actions.js');
      fs.writeFileSync(
        exportedModulePath,
        [
          "'use server';",
          'exports.namedAction = async function namedAction(value) {',
          "  return { kind: 'exported', value };",
          '};',
          '',
        ].join('\n'),
        'utf8'
      );

      delete require.cache[require.resolve(exportedModulePath)];
      const exportedModule = require(exportedModulePath);
      const exportedActionId = actionRuntime.createExportServerReferenceId(
        exportedModulePath,
        'namedAction'
      );
      assert.equal(
        actionRuntime.resolveRegisteredServerReference(exportedActionId),
        exportedModule.namedAction,
        'Top-level use server module exports should be registered'
      );
    } finally {
      fs.rmSync(tempProject, { recursive: true, force: true });
    }

    console.log('Server runtime verification passed.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Server runtime verification failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
