import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { FLASH_DIR } from '../constants';
import { isNativeAvailable, scanAppNative } from '../build/rsc/native-scanner';

export type FlashpackPhase = 'dev' | 'build' | 'start';
export type FlashpackMode = 'development' | 'production';

export interface FlashpackPrepareOptions {
  cwd: string;
  phase: FlashpackPhase;
  mode: FlashpackMode;
  allowFallback?: boolean;
}

export interface FlashpackPrepareResult {
  flashDir: string;
  rustPipelineUsed: boolean;
  workspaceRoot: string | null;
  graphPath: string;
}

function ensureDir(absolutePath: string): void {
  fs.mkdirSync(absolutePath, { recursive: true });
}

function writeJsonFile(absolutePath: string, payload: unknown): void {
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, JSON.stringify(payload, null, 2));
}

function removeLegacyFlashArtifacts(cwd: string, flashDir: string): void {
  for (const legacyPath of [
    path.join(cwd, '.turbo'),
    path.join(flashDir, 'cache', 'turbo'),
    path.join(flashDir, 'turbo'),
  ]) {
    if (!fs.existsSync(legacyPath)) {
      continue;
    }
    fs.rmSync(legacyPath, { recursive: true, force: true });
  }
}

export function findFlashpackWorkspaceRoot(startCwd: string): string | null {
  let current = path.resolve(startCwd);

  while (true) {
    const candidate = path.join(current, 'flashpack', 'xtask', 'Cargo.toml');
    if (fs.existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

export function bootstrapFlashDirectories(cwd: string): string {
  const flashDir = path.join(cwd, FLASH_DIR);
  removeLegacyFlashArtifacts(cwd, flashDir);
  const dirs = [
    flashDir,
    path.join(flashDir, 'graph'),
    path.join(flashDir, 'logs'),
    path.join(flashDir, 'runtime'),
    path.join(flashDir, 'state'),
  ];

  dirs.forEach(ensureDir);
  return flashDir;
}

export function resolveCargoCommand(): string {
  if (process.env.CARGO && process.env.CARGO.trim().length > 0) {
    return process.env.CARGO.trim();
  }

  if (process.platform === 'win32') {
    const whereResult = spawnSync('where.exe', ['cargo'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    if (whereResult.status === 0) {
      const first = String(whereResult.stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      if (first) return first;
    }

    return 'cargo.exe';
  }

  const whichResult = spawnSync('which', ['cargo'], {
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  if (whichResult.status === 0) {
    const first = String(whichResult.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (first) return first;
  }

  return 'cargo';
}

export interface FlashpackRustCliOptions {
  cwd: string;
  phase: FlashpackPhase;
  mode: FlashpackMode;
  action?: 'prepare' | 'run';
  runnerPath?: string;
  nodeCommand?: string;
  port?: number | string;
}

export interface FlashpackRustCliResult {
  flashDir: string;
  workspaceRoot: string | null;
  cargoCommand: string | null;
  args: string[];
  logPath: string;
  graphPath: string;
  runtimeManifestPath: string;
  error?: string;
  status: number | null;
}

function buildRustCliArgs(options: FlashpackRustCliOptions, graphPath: string): string[] {
  const args = [
    'run',
    '-q',
    '-p',
    'flashpack-cli',
    '--',
    '--cwd',
    options.cwd,
    '--phase',
    options.phase,
    '--mode',
    options.mode,
    '--action',
    options.action || 'prepare',
  ];

  if (options.runnerPath) {
    args.push('--runner', options.runnerPath);
  }
  if (options.nodeCommand) {
    args.push('--node', options.nodeCommand);
  }
  if (options.port !== undefined && options.port !== null && String(options.port).trim().length > 0) {
    args.push('--port', String(options.port));
  }

  return args;
}

export function runFlashpackRustCli(
  options: FlashpackRustCliOptions
): FlashpackRustCliResult {
  const flashDir = bootstrapFlashDirectories(options.cwd);
  const workspaceRoot = findFlashpackWorkspaceRoot(options.cwd);
  const graphPath = path.join(flashDir, 'graph', `${options.phase}-rust.json`);
  const runtimeManifestPath = path.join(flashDir, 'runtime', `${options.phase}-manifest.json`);
  const logPath = path.join(flashDir, 'logs', `${options.phase}-cli.log`);

  if (!workspaceRoot) {
    return {
      flashDir,
      workspaceRoot: null,
      cargoCommand: null,
      args: [],
      logPath,
      graphPath,
      runtimeManifestPath,
      error: `Rust workspace not found from ${options.cwd}. Expected flashpack/xtask/Cargo.toml in an ancestor directory.`,
      status: null,
    };
  }

  const cargoCommand = resolveCargoCommand();
  const args = buildRustCliArgs(options, graphPath);
  const result = spawnSync(cargoCommand, args, {
    cwd: workspaceRoot,
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  const log = [
    `[flashpack] workspace=${workspaceRoot}`,
    `[flashpack] command=${cargoCommand} ${args.join(' ')}`,
    `[flashpack] status=${result.status ?? 'null'}`,
    `[flashpack] error=${result.error ? result.error.message : ''}`,
    '[flashpack] stdout:',
    result.stdout || '',
    '[flashpack] stderr:',
    result.stderr || '',
  ].join('\n');
  fs.writeFileSync(logPath, log);

  return {
    flashDir,
    workspaceRoot,
    cargoCommand,
    args,
    logPath,
    graphPath,
    runtimeManifestPath,
    error: result.error
      ? result.error.message
      : result.status === 0
        ? undefined
        : (result.stderr || result.stdout || 'unknown cargo failure').trim(),
    status: result.status ?? null,
  };
}

export function prepareFlashpackRuntime(options: FlashpackPrepareOptions): FlashpackPrepareResult {
  const { cwd, phase, mode, allowFallback = true } = options;
  const flashDir = bootstrapFlashDirectories(cwd);
  const now = new Date().toISOString();
  const graphPath = path.join(flashDir, 'graph', `${phase}.json`);

  writeJsonFile(path.join(flashDir, 'state', 'latest.json'), {
    engine: 'flashpack',
    phase,
    mode,
    timestamp: now,
    cwd,
  });

  writeJsonFile(graphPath, {
    engine: 'flashpack',
    phase,
    mode,
    generatedBy: 'vista-ts-bootstrap',
    timestamp: now,
  });

  const appDir = path.join(cwd, 'app');
  if (isNativeAvailable() && fs.existsSync(appDir)) {
    const nativeScan = scanAppNative(appDir);
    if (nativeScan) {
      const nativeGraphPath = path.join(flashDir, 'graph', `${phase}-rust.json`);
      writeJsonFile(nativeGraphPath, {
        engine: 'flashpack',
        pipeline: 'rust-napi',
        phase,
        mode,
        timestamp: now,
        appDir,
        stats: {
          totalFiles: nativeScan.totalFiles,
          scanTimeMs: nativeScan.scanTimeMs,
          clientComponents: nativeScan.clientComponents.length,
          serverComponents: nativeScan.serverComponents.length,
          pages: nativeScan.pages.length,
          layouts: nativeScan.layouts.length,
          apiRoutes: nativeScan.apiRoutes.length,
          errors: nativeScan.errors.length,
        },
      });

      return {
        flashDir,
        rustPipelineUsed: true,
        workspaceRoot: null,
        graphPath: nativeGraphPath,
      };
    }
  }

  const rustResult = runFlashpackRustCli({
    cwd,
    phase,
    mode,
    action: 'prepare',
  });

  if (rustResult.error || rustResult.status !== 0) {
    const detail = rustResult.error || 'unknown cargo failure';
    if (!allowFallback) {
      throw new Error(`[flashpack] Rust pipeline failed: ${detail}`);
    }

    return {
      flashDir,
      rustPipelineUsed: false,
      workspaceRoot: rustResult.workspaceRoot,
      graphPath,
    };
  }

  return {
    flashDir,
    rustPipelineUsed: true,
    workspaceRoot: rustResult.workspaceRoot,
    graphPath: rustResult.graphPath,
  };
}
