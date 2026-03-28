import path from 'path';
import { spawn } from 'child_process';
import { buildRSC as buildRSCCore } from '../bin/build-rsc';
import { startRSCServer as startRSCCoreServer } from '../server/rsc-engine';
import { getErrorMessage, isPermissionDeniedSpawnError } from '../server/spawn-permissions';
import {
  runFlashpackRustCli,
  type FlashpackPhase,
  type FlashpackMode,
} from './runtime';

type FlashpackCommandPhase = 'dev' | 'build' | 'start';

interface RunFlashpackCommandOptions {
  cwd?: string;
  port?: string | number;
  strict?: boolean;
}

function resolveMode(phase: FlashpackCommandPhase): FlashpackMode {
  if (phase === 'dev') {
    return 'development';
  }
  return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}

function getRunnerPath(): string {
  return path.resolve(__dirname, '..', 'bin', 'flashpack-runner.js');
}

function formatRustFailure(message: string): string {
  return `[flashpack] Rust command unavailable: ${message}`;
}

async function fallbackToCore(
  phase: FlashpackCommandPhase,
  port: string | number | undefined
): Promise<void> {
  const normalizedPort = Number(port || process.env.PORT || 3003) || 3003;
  process.env.VISTA_ENGINE = 'flashpack';
  process.env.VISTA_ENGINE_VARIANT = 'flashpack';
  process.env.VISTA_FLASHPACK = 'true';
  process.env.VISTA_FLASHPACK_PIPELINE = 'js-fallback';

  if (phase === 'build') {
    await buildRSCCore(false);
    return;
  }

  if (phase === 'dev') {
    const result = await buildRSCCore(true);
    startRSCCoreServer({
      port: normalizedPort,
      compiler: result.clientCompiler,
    });
    return;
  }

  startRSCCoreServer({
    port: normalizedPort,
  });
}

export async function runFlashpackEngineCommand(
  phase: FlashpackCommandPhase,
  options: RunFlashpackCommandOptions = {}
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const strict = options.strict ?? process.env.VISTA_FLASHPACK_STRICT !== 'false';
  const mode = resolveMode(phase);
  const runnerPath = getRunnerPath();
  const port = options.port || process.env.PORT || 3003;

  const prepare = runFlashpackRustCli({
    cwd,
    phase: phase as FlashpackPhase,
    mode,
    action: 'prepare',
  });

  if (prepare.error || prepare.status !== 0) {
    if (strict) {
      throw new Error(formatRustFailure(prepare.error || 'unknown failure'));
    }

    await fallbackToCore(phase, port);
    return;
  }

  const workspaceRoot = prepare.workspaceRoot;
  const cargoCommand = prepare.cargoCommand;
  if (!workspaceRoot || !cargoCommand) {
    if (strict) {
      throw new Error('[flashpack] Rust workspace unavailable for flashpack command.');
    }
    await fallbackToCore(phase, port);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      cargoCommand,
      [
        'run',
        '-q',
        '-p',
        'flashpack-cli',
        '--',
        '--cwd',
        cwd,
        '--phase',
        phase,
        '--mode',
        mode,
        '--action',
        'run',
        '--node',
        process.execPath,
        '--runner',
        runnerPath,
        '--port',
        String(port),
      ],
      {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          VISTA_ENGINE: 'flashpack',
          VISTA_ENGINE_VARIANT: 'flashpack',
          VISTA_FLASHPACK: 'true',
          VISTA_FLASHPACK_PIPELINE: 'rust-cli',
        },
        stdio: 'inherit',
        windowsHide: true,
      }
    );

    child.once('error', async (error) => {
      const message = isPermissionDeniedSpawnError(error)
        ? formatRustFailure(`spawn blocked by environment permissions (${getErrorMessage(error)})`)
        : formatRustFailure(getErrorMessage(error));

      if (!strict) {
        try {
          await fallbackToCore(phase, port);
          resolve();
          return;
        } catch (fallbackError) {
          reject(fallbackError);
          return;
        }
      }
      reject(new Error(message));
    });

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `[flashpack] Rust command failed for ${phase} (code=${code}, signal=${signal || 'none'})`
        )
      );
    });
  });
}

export default runFlashpackEngineCommand;
