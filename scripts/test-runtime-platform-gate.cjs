#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ALLOWED_PLATFORMS = new Set(['win32', 'linux']);
const COMMANDS = [
  ['scripts/test-integrity.cjs'],
  ['scripts/test-server-runtime.cjs'],
  ['scripts/test-fullstack-runtime.cjs'],
  ['scripts/test-vista-hardening.cjs'],
  ['scripts/test-vista-output.cjs'],
  ['scripts/test-rsc-conformance.cjs'],
  ['scripts/test-flashpack-dev.cjs'],
  ['scripts/test-flashpack-state.cjs'],
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!ALLOWED_PLATFORMS.has(process.platform)) {
  fail(
    `Runtime platform gate expects win32 or linux runners. Current platform: ${process.platform}`
  );
}

for (const args of COMMANDS) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('Runtime platform gate passed.');
