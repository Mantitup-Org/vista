#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(source, pattern, message) {
  assert(source.includes(pattern), message);
}

function main() {
  const routerSource = read(path.join('packages', 'vista', 'src', 'client', 'rsc-router.tsx'));
  const pprSource = read(path.join('packages', 'vista', 'src', 'server', 'ppr.ts'));
  const devtoolsSource = read(
    path.join('packages', 'vista', 'src', 'bin', 'devtools-indicator-snippet.ts')
  );

  assertIncludes(
    routerSource,
    '__VISTA_RUNTIME_TRACE__',
    'RSCRouter must expose the runtime trace store.'
  );
  assertIncludes(
    routerSource,
    'rsc-resume-start',
    'RSCRouter must record resume-start trace events.'
  );
  assertIncludes(
    routerSource,
    'rsc-resume-complete',
    'RSCRouter must record resume-complete trace events.'
  );
  assertIncludes(
    routerSource,
    'rsc-resume-error',
    'RSCRouter must record resume-error trace events.'
  );

  assertIncludes(
    pprSource,
    'window.__VISTA_RUNTIME_TRACE__',
    'PPR bootstrap must initialize runtime tracing when needed.'
  );
  assertIncludes(
    pprSource,
    'vista:ppr-complete',
    'PPR bootstrap must emit completion events.'
  );
  assertIncludes(
    pprSource,
    'vista:ppr-error',
    'PPR bootstrap must emit error events.'
  );

  for (const eventName of [
    'vista:ppr-shell',
    'vista:ppr-resume',
    'vista:ppr-complete',
    'vista:ppr-error',
    'vista:rsc-resume-start',
    'vista:rsc-resume-complete',
    'vista:rsc-resume-error',
  ]) {
    assertIncludes(
      devtoolsSource,
      eventName,
      `Devtools indicator must listen for ${eventName}.`
    );
  }

  console.log('Advanced runtime tracing verification passed.');
}

main();
