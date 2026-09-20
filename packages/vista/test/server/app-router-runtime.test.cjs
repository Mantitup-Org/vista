#!/usr/bin/env node

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const { isPathInside, resolveDirectoryChain } = require('../../dist/server/app-router-runtime');
const { isBootstrapChunkFile, sortHydrationChunkFiles } = require('../../dist/server/hydration-chunks');

test('resolveDirectoryChain includes the app root on mixed Windows drive casing', () => {
  const appDir = 'e:\\vista\\apps\\web\\app';
  const pagePath = 'E:\\vista\\apps\\web\\app\\docs\\page.tsx';
  const chain = resolveDirectoryChain(appDir, pagePath);
  assert.equal(chain.length, 2);
  assert.match(chain[0].replace(/\\/g, '/'), /\/app$/i);
  assert.match(chain[1].replace(/\\/g, '/'), /\/app\/docs$/i);
});

test('isPathInside is case-insensitive on Windows', () => {
  if (process.platform !== 'win32') {
    assert.equal(
      isPathInside('/repo/app', '/repo/app/docs'),
      true
    );
    return;
  }
  assert.equal(isPathInside('e:\\repo\\app', 'E:\\repo\\app\\docs\\page.tsx'), true);
});

test('bootstrap chunk filter keeps entry scripts and drops async client chunks', () => {
  const sorted = sortHydrationChunkFiles(
    ['client4-058a0e69.js', 'main-c74a991d.js', 'vendor-aa11bb22.js', 'webpack-deadbeef.js'].filter(
      isBootstrapChunkFile
    )
  );
  assert.deepEqual(sorted, ['webpack-deadbeef.js', 'vendor-aa11bb22.js', 'main-c74a991d.js']);
  assert.equal(isBootstrapChunkFile('client4-058a0e69.js'), false);
});
