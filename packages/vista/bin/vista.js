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

const useLegacy = flags.includes('--legacy') || process.env.VISTA_LEGACY === 'true';
const useRSC = !useLegacy;
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

const envEngineVariant = normalizeEngineVariant(
  process.env.VISTA_ENGINE_VARIANT ||
    process.env.VISTA_ENGINE ||
    (process.env.VISTA_FLASHPACK === 'true' ? 'flashpack' : '')
);

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
const engineVariant = forcedByFlag || envEngineVariant || configEngineVariant || 'default';
process.env.VISTA_ENGINE = engineVariant;
process.env.VISTA_ENGINE_VARIANT = engineVariant;
process.env.VISTA_FLASHPACK = engineVariant === 'flashpack' ? 'true' : 'false';

// Mark startup time for "Ready in Xms" display
const { markStartTime } = require('../dist/server/logger');
markStartTime();

if (command === 'dev') {
  forceRuntimeEnv('development');
  if (useRSC) {
    console.log(`[vista] Engine: ${process.env.VISTA_ENGINE}`);
    const useFlashpack = process.env.VISTA_ENGINE === 'flashpack';
    if (useFlashpack) {
      const { runFlashpackEngineCommand } = require('../dist/flashpack/command');
      runFlashpackEngineCommand('dev', {
        cwd: process.cwd(),
        port: process.env.PORT || 3003,
      }).catch((err) => {
        console.error('Flashpack dev failed:', err);
        process.exit(1);
      });
      return;
    }
    const { buildRSC } = useFlashpack
      ? require('../dist/bin/build-rsc-flashpack')
      : require('../dist/bin/build-rsc');
    const { startRSCServer } = useFlashpack
      ? require('../dist/server/rsc-engine-flashpack')
      : require('../dist/server/rsc-engine');

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
  } else {
    // Legacy SSR Mode (--legacy)
    const { startServer } = require('../dist/server/engine');
    const { buildClient } = require('../dist/bin/build');

    buildClient(true)
      .then((compiler) => {
        startServer(process.env.PORT || 3003, compiler);
      })
      .catch((err) => {
        console.error('Build failed:', err);
        process.exit(1);
      });
  }
} else if (command === 'build') {
  forceRuntimeEnv('production');
  if (useRSC) {
    console.log(`[vista] Engine: ${process.env.VISTA_ENGINE}`);
    const useFlashpack = process.env.VISTA_ENGINE === 'flashpack';
    if (useFlashpack) {
      const { runFlashpackEngineCommand } = require('../dist/flashpack/command');
      runFlashpackEngineCommand('build', {
        cwd: process.cwd(),
      })
        .then(() => {
          console.log('');
          console.log('Production build complete!');
        })
        .catch((err) => {
          console.error('Flashpack build failed:', err);
          process.exit(1);
        });
      return;
    }
    const { buildRSC } = useFlashpack
      ? require('../dist/bin/build-rsc-flashpack')
      : require('../dist/bin/build-rsc');

    buildRSC(false)
      .then(() => {
        console.log('');
        console.log('Production build complete!');
      })
      .catch((err) => {
        console.error('RSC Build failed:', err);
        process.exit(1);
      });
  } else {
    // Legacy Build (--legacy)
    const { buildClient } = require('../dist/bin/build');

    buildClient(false)
      .then(() => {
        console.log('Production build complete!');
      })
      .catch((err) => {
        console.error('Build failed:', err);
        process.exit(1);
      });
  }
} else if (command === 'start') {
  forceRuntimeEnv('production');
  if (useRSC) {
    console.log(`[vista] Engine: ${process.env.VISTA_ENGINE}`);
    if (process.env.VISTA_ENGINE === 'flashpack') {
      const { runFlashpackEngineCommand } = require('../dist/flashpack/command');
      runFlashpackEngineCommand('start', {
        cwd: process.cwd(),
        port: process.env.PORT || 3003,
      }).catch((err) => {
        console.error('Flashpack start failed:', err);
        process.exit(1);
      });
      return;
    }
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

    const useFlashpack = process.env.VISTA_ENGINE === 'flashpack';
    const { startRSCServer } = useFlashpack
      ? require('../dist/server/rsc-engine-flashpack')
      : require('../dist/server/rsc-engine');
    startRSCServer({ port: process.env.PORT || 3003 });
  } else {
    const { startServer } = require('../dist/server/engine');
    startServer(process.env.PORT || 3003);
  }
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
  console.log('  g       Generate typed API scaffolds (api-init, router, procedure)');
  console.log('');
  console.log('Options:');
  console.log('  --legacy   Use traditional SSR mode (instead of RSC)');
  console.log('  --engine <default|flashpack>   Select engine variant');
  console.log('  --flashpack   Use Rust-first Flashpack engine path');
  console.log('  --default-engine   Force default engine path');
  console.log('  --webpack   Alias of --default-engine');
  console.log('');
  console.log('Examples:');
  console.log('  vista dev            # Start dev server (RSC mode)');
  console.log('  vista dev --legacy   # Start dev server with legacy SSR');
  console.log('  vista dev --flashpack   # Start dev server with Flashpack mode');
  console.log('  vista build          # Production build with RSC');
  console.log('  vista g api-init     # Generate typed API starter files');
  console.log('');
}
