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

  throw new Error('No TypeScript runtime found for use cache tests.');
}

registerTypeScriptRuntime();

const { validateModuleBoundaries } = require(path.join(
  repoRoot,
  'packages',
  'vista',
  'src',
  'server',
  'module-boundary-validator.ts'
));
const { installModuleCompileHook } = require(path.join(
  repoRoot,
  'packages',
  'vista',
  'src',
  'server',
  'module-compile-hook.ts'
));

function writeUseCacheFixture(appDir) {
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(
    path.join(appDir, 'page.js'),
    [
      "'use cache';",
      'module.exports = function Page() {',
      '  return null;',
      '};',
      '',
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(appDir, 'inline.js'),
    [
      'module.exports = async function InlineFixture() {',
      '  async function loadValue() {',
      "    'use cache';",
      "    return 'inline';",
      '  }',
      '  return loadValue();',
      '};',
      '',
    ].join('\n'),
    'utf8'
  );
}

async function main() {
  const tempProject = fs.mkdtempSync(path.join(repoRoot, '.tmp-use-cache-'));

  try {
    const appDir = path.join(tempProject, 'app');
    writeUseCacheFixture(appDir);
    const pagePath = path.join(appDir, 'page.js');
    const inlinePath = path.join(appDir, 'inline.js');

    const disabledIssues = validateModuleBoundaries({
      appDir,
      cacheComponentsEnabled: false,
    }).issues;
    assert(
      disabledIssues.some((issue) => issue.code === 'USE_CACHE_NOT_ENABLED'),
      'Expected disabled cache components validation to report USE_CACHE_NOT_ENABLED'
    );

    const enabledIssues = validateModuleBoundaries({
      appDir,
      cacheComponentsEnabled: true,
    }).issues;
    assert.equal(
      enabledIssues.some((issue) => issue.code === 'USE_CACHE_NOT_ENABLED'),
      false,
      'Did not expect USE_CACHE_NOT_ENABLED once cache components are enabled'
    );

    installModuleCompileHook({
      cwd: tempProject,
      cacheComponentsEnabled: false,
    });

    try {
      delete require.cache[require.resolve(pagePath)];
    } catch {}

    assert.throws(
      () => require(pagePath),
      /enable experimental\.cacheComponents\.enabled/i,
      'Expected the compile hook to block use cache when the feature flag is disabled'
    );

    try {
      delete require.cache[require.resolve(inlinePath)];
    } catch {}

    assert.throws(
      () => require(inlinePath),
      /enable experimental\.cacheComponents\.enabled/i,
      'Expected the compile hook to block inline use cache when the feature flag is disabled'
    );

    try {
      delete require.cache[require.resolve(pagePath)];
    } catch {}

    installModuleCompileHook({
      cwd: tempProject,
      cacheComponentsEnabled: true,
    });

    const loadedModule = require(pagePath);
    assert.equal(typeof loadedModule, 'function');

    try {
      delete require.cache[require.resolve(inlinePath)];
    } catch {}

    const inlineModule = require(inlinePath);
    assert.equal(typeof inlineModule, 'function');

    console.log('Use cache verification passed.');
  } finally {
    fs.rmSync(tempProject, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Use cache verification failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
