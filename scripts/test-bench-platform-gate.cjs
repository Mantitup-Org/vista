#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ALLOWED_PLATFORMS = new Set(['win32', 'linux']);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!ALLOWED_PLATFORMS.has(process.platform)) {
  fail(
    `Bench platform gate expects win32 or linux runners. Current platform: ${process.platform}`
  );
}

const structure = spawnSync(process.execPath, [path.join('scripts', 'test-bench.cjs')], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});
if (structure.status !== 0) {
  process.exit(structure.status || 1);
}

if (process.env.VISTA_RUN_BENCH_SMOKE === '1') {
  const smoke = spawnSync(
    process.execPath,
    [
      path.join('scripts', 'devlow-bench.mjs'),
      '--mode',
      'build',
      '--runs',
      '1',
      '--requests',
      '1',
      '--benchmarks',
      'basic-app',
      '--variants',
      'flashpack,default',
    ],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    }
  );
  if (smoke.status !== 0) {
    process.exit(smoke.status || 1);
  }
}

console.log('Bench platform gate passed.');
