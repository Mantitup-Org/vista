import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { getSharedDevClientSource } from '../bin/dev-client-runtime';
import { getErrorMessage, isPermissionDeniedSpawnError } from '../server/spawn-permissions';
import {
  resolveFlashpackLaunch,
  resolveFlashpackSsrRunner,
  type FlashpackMode,
} from './runtime';

type FlashpackCommandPhase = 'dev' | 'build' | 'start';

interface RunFlashpackCommandOptions {
  cwd?: string;
  port?: string | number;
  strict?: boolean;
  action?: 'prepare' | 'run';
}

function resolveMode(phase: FlashpackCommandPhase): FlashpackMode {
  if (phase === 'dev') {
    return 'development';
  }
  return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}

function formatRustFailure(message: string): string {
  return `[flashpack] Rust command unavailable: ${message}`;
}

function vistaVersion(): string {
  try {
    const require = createRequire(__filename);
    const pkg = require('../../package.json') as { version?: string };
    return pkg.version || '0.3.8';
  } catch {
    return '0.3.8';
  }
}

function installDevClient(cwd: string): void {
  const file = path.join(cwd, '.flash', 'dev', 'vista-dev.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, getSharedDevClientSource(String(Date.now())));
}

function networkHost(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '';
}

export async function runFlashpackEngineCommand(
  phase: FlashpackCommandPhase,
  options: RunFlashpackCommandOptions = {}
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const mode = resolveMode(phase);
  const port = options.port || process.env.PORT || 3003;
  const action = options.action || 'run';
  const launch = resolveFlashpackLaunch(cwd);
  const ssrRunner = action === 'run' ? resolveFlashpackSsrRunner(cwd) : null;
  if (action === 'run') {
    installDevClient(cwd);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      launch.command,
      [
        ...launch.args,
        '--cwd',
        cwd,
        '--phase',
        phase,
        '--mode',
        mode,
        '--action',
        action,
        ...(action === 'run' ? ['--port', String(port)] : []),
        ...(ssrRunner ? ['--ssr-runner', ssrRunner] : []),
      ],
      {
        cwd: launch.cwd,
        env: {
          ...process.env,
          VISTA_ENGINE: 'flashpack',
          VISTA_ENGINE_VARIANT: 'flashpack',
          VISTA_FLASHPACK: 'true',
          VISTA_FLASHPACK_PIPELINE: 'rust-swc',
          VISTA_VERSION: vistaVersion(),
          VISTA_NETWORK_HOST: networkHost(),
        },
        stdio: 'inherit',
        windowsHide: true,
      }
    );

    child.once('error', (error) => {
      const message = isPermissionDeniedSpawnError(error)
        ? formatRustFailure(`spawn blocked by environment permissions (${getErrorMessage(error)})`)
        : formatRustFailure(getErrorMessage(error));
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
