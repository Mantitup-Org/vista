#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const command = process.argv[2];
const flags = process.argv.slice(3);

function getFlagValue(flag) {
  const index = flags.indexOf(flag);
  if (index !== -1) {
    const next = flags[index + 1];
    if (next && !next.startsWith('-')) return next;
  }

  const inline = flags.find((value) => value.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  return undefined;
}

function normalizeEngineVariant(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();

  if (!value) return null;
  if (value === 'default' || value === 'webpack') return 'default';
  if (value === 'flashpack') return 'flashpack';
  return null;
}

function forceRuntimeEnv(mode) {
  if (mode === 'development') {
    process.env.NODE_ENV = 'development';
    return;
  }
  process.env.NODE_ENV = 'production';
}

if (command === 'g' || command === 'generate') {
  const { runGenerateCommand } = require('../dist/bin/generate');
  runGenerateCommand(flags).then((code) => {
    if (code !== 0) process.exit(code);
  });
  return;
}

if (command === 'deploy') {
  const { runDeployCommand } = require('../dist/bin/deploy');
  runDeployCommand(flags)
    .then((code) => {
      if (code !== 0) process.exit(code);
    })
    .catch((err) => {
      console.error('Deploy failed:', err);
      process.exit(1);
    });
  return;
}

const useLegacy = flags.includes('--legacy') || process.env.VISTA_LEGACY === 'true';
if (useLegacy) {
  console.error(
    '[vista] --legacy / VISTA_LEGACY island SSR has been removed. Use default Flight RSC/SSR (omit --legacy) or --flashpack.'
  );
  process.exit(1);
}

const explicitFlashpack = flags.includes('--flashpack');
const explicitDefaultEngine = flags.includes('--default-engine') || flags.includes('--webpack');
const explicitEngineFlag = getFlagValue('--engine');
const explicitEngineVariant = normalizeEngineVariant(explicitEngineFlag);

if (explicitEngineFlag && !explicitEngineVariant) {
  console.error(
    `Unsupported engine "${explicitEngineFlag}". Use "default" or "flashpack" (legacy alias: webpack).`
  );
  process.exit(1);
}

if (
  (explicitFlashpack && explicitDefaultEngine) ||
  (explicitEngineVariant && (explicitFlashpack || explicitDefaultEngine))
) {
  console.error('Use only one engine selector: --engine, --flashpack, or --default-engine/--webpack.');
  process.exit(1);
}

function readPackageEngine(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const vista = pkg && pkg.vista;
    const raw = typeof vista === 'string' ? vista : vista && vista.engine;
    return normalizeEngineVariant(raw);
  } catch {
    return null;
  }
}

const envEngineVariant = normalizeEngineVariant(
  process.env.VISTA_ENGINE_VARIANT ||
    process.env.VISTA_ENGINE ||
    (process.env.VISTA_FLASHPACK === 'true' ? 'flashpack' : '')
);
const packageEngineVariant = readPackageEngine(process.cwd());

let configEngineVariant = null;
try {
  const { loadConfig } = require('../dist/config');
  const projectConfig = loadConfig(process.cwd());
  const fromConfig =
    typeof projectConfig?.engine === 'string'
      ? projectConfig.engine
      : projectConfig?.engine && typeof projectConfig.engine === 'object'
        ? projectConfig.engine.variant
        : '';
  configEngineVariant = normalizeEngineVariant(fromConfig);
} catch {
  // Best effort only; keep CLI resilient if config loading fails.
}

const forcedByFlag = explicitEngineVariant || (explicitFlashpack ? 'flashpack' : null) || (explicitDefaultEngine ? 'default' : null);
const engineVariant = forcedByFlag || envEngineVariant || packageEngineVariant || configEngineVariant || 'default';
process.env.VISTA_ENGINE = engineVariant;
process.env.VISTA_ENGINE_VARIANT = engineVariant;
process.env.VISTA_FLASHPACK = engineVariant === 'flashpack' ? 'true' : 'false';

// Mark startup time for "Ready in Xms" display
const { markStartTime } = require('../dist/server/logger');
markStartTime();

function startFlightDev() {
  const { buildRSC } = require('../dist/bin/build-rsc');
  const { startRSCServer } = require('../dist/server/rsc-engine');

  buildRSC(true)
    .then(({ clientCompiler }) => {
      startRSCServer({
        port: process.env.PORT || 3003,
        compiler: clientCompiler,
      });
    })
    .catch((err) => {
      console.error('RSC Build failed:', err);
      process.exit(1);
    });
}

if (command === 'dev') {
  forceRuntimeEnv('development');
  if (process.env.VISTA_ENGINE === 'flashpack') {
    const { runFlashpackEngineCommand } = require('../dist/flashpack/command');
    runFlashpackEngineCommand('dev', {
      cwd: process.cwd(),
      action: 'run',
      port: process.env.PORT || 3003,
    }).catch((err) => {
      console.error('Flashpack dev failed:', err);
      process.exit(1);
    });
    return;
  }
  startFlightDev();
} else if (command === 'build') {
  forceRuntimeEnv('production');
  console.log(`[vista] Engine: ${process.env.VISTA_ENGINE}`);
  const { buildRSC } = require('../dist/bin/build-rsc');

  buildRSC(false)
    .then(() => {
      console.log('');
      console.log('Production build complete!');
    })
    .catch((err) => {
      console.error('RSC Build failed:', err);
      process.exit(1);
    });
} else if (command === 'bind') {
  const rust = require('../dist/rust');
  const route = getFlagValue('--route') || '(shop)/products/[id]';
  const folders = route.split('/').filter((part) => part.length > 0);
  console.log(`[vista] rust native=${rust.nativeBindingsLoaded()}`);
  for (const folder of folders) {
    const classified = rust.classifyAppSegment(folder);
    console.log(`[vista] ${folder} -> ${classified.kind} (${classified.segment})`);
  }
  console.log(`[vista] pattern ${rust.routePattern(folders)}`);
  console.log(`[vista] error ${rust.encodeVistaErrorCode('ROUTE_MISSING')}`);
  console.log(`[vista] taskless ${rust.tasklessSteps(true).join(' -> ')}`);
  if (engineVariant === 'flashpack') {
    const { prepareFlashpackRuntime } = require('../dist/flashpack/runtime');
    const prepared = prepareFlashpackRuntime({
      cwd: process.cwd(),
      phase: 'build',
      mode: 'production',
      allowFallback: true,
    });
    console.log(`[vista] flashpack crates bound=${prepared.rustPipelineUsed}`);
    if (!prepared.rustPipelineUsed) process.exit(1);
  }
} else if (command === 'start') {
  forceRuntimeEnv('production');
  console.log(`[vista] Engine: ${process.env.VISTA_ENGINE}`);
  const standaloneServerPath = path.join(process.cwd(), '.vista', 'standalone', 'server.js');
  if (fs.existsSync(standaloneServerPath)) {
    const standalone = require(standaloneServerPath);
    const startStandaloneServer =
      standalone.startStandaloneServer || standalone.default || standalone;
    startStandaloneServer({
      port: process.env.PORT || 3003,
      engine: process.env.VISTA_ENGINE,
    });
    return;
  }

  const { startRSCServer } = require('../dist/server/rsc-engine');
  startRSCServer({ port: process.env.PORT || 3003 });
} else {
  console.log('');
  console.log('Vista JS Framework CLI');
  console.log('');
  console.log('Usage: vista <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  dev     Start development server with HMR');
  console.log('  build   Create production build');
  console.log('  start   Start production server');
  console.log('  deploy  Build and deploy to a hosting platform');
  console.log('  g       Generate typed API scaffolds (api-init, router, procedure)');
  console.log('  bind    Classify a route and, with --flashpack, bind the Rust crates');
  console.log('');
  console.log('Options:');
  console.log('  --engine <default|flashpack>   Select engine variant');
  console.log('  --flashpack   Use Rust-first Flashpack engine path');
  console.log('  --default-engine   Force default engine path');
  console.log('  --webpack   Alias of --default-engine');
  console.log('  deploy --target <platform>   Deploy to render, vercel, cloudflare, netlify, or docker');
  console.log('  deploy --dry-run             Validate and emit deploy artifacts only');
  console.log('');
  console.log('Examples:');
  console.log('  vista dev            # Start Flight RSC/SSR dev server');
  console.log('  vista dev --flashpack   # Start dev server with Flashpack mode');
  console.log('  vista build          # Production Flight RSC/SSR build');
  console.log('  vista g api-init     # Generate typed API starter files');
  console.log('  vista bind --route "(shop)/products/[id]"');
  console.log('  vista bind --flashpack');
  console.log('');
}
