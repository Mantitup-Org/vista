import fs from 'fs';
import path from 'path';
import { buildRSC } from './build-rsc';
import { startRSCServer } from '../server/rsc-engine';

type FlashpackRunnerPhase = 'dev' | 'build' | 'start';

function parseCliArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function normalizePhase(raw: string | undefined): FlashpackRunnerPhase {
  const value = String(raw || '')
    .trim()
    .toLowerCase();

  if (value === 'dev' || value === 'development') return 'dev';
  if (value === 'start') return 'start';
  return 'build';
}

async function main(): Promise<void> {
  const phase = normalizePhase(parseCliArg('--phase'));
  const rawPort = parseCliArg('--port') || process.env.PORT || '3003';
  const port = Number(rawPort) || 3003;

  process.env.VISTA_ENGINE = 'flashpack';
  process.env.VISTA_ENGINE_VARIANT = 'flashpack';
  process.env.VISTA_FLASHPACK = 'true';
  process.env.VISTA_FLASHPACK_PIPELINE = process.env.VISTA_FLASHPACK_PIPELINE || 'rust-cli';

  if (phase === 'build') {
    await buildRSC(false);
    return;
  }

  if (phase === 'dev') {
    const buildResult = await buildRSC(true);
    startRSCServer({
      port,
      compiler: buildResult.clientCompiler,
    });
    return;
  }

  const standaloneServerPath = path.join(process.cwd(), '.vista', 'standalone', 'server.js');
  if (fs.existsSync(standaloneServerPath)) {
    const standalone = require(standaloneServerPath);
    const startStandaloneServer =
      standalone.startStandaloneServer || standalone.default || standalone;
    startStandaloneServer({
      port,
      engine: 'flashpack',
    });
    return;
  }

  startRSCServer({ port });
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
