import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { listKnownTargets, runDeploy, type ResolvedDeployTarget } from '../deploy';

export interface RunDeployCommandOptions {
  cwd?: string;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

function getFlagValue(flags: string[], flag: string): string | undefined {
  const index = flags.indexOf(flag);
  if (index !== -1) {
    const next = flags[index + 1];
    if (next && !next.startsWith('-')) return next;
  }

  const inline = flags.find((value) => value.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  return undefined;
}

function printHelp(): void {
  console.log('');
  console.log('Usage: vista deploy [options]');
  console.log('');
  console.log('Options:');
  console.log('  --target <auto|render|vercel|cloudflare|netlify|docker>');
  console.log('  --output <standalone|static|hybrid>');
  console.log('  --prod                 Production deploy (default)');
  console.log('  --preview              Preview/staging deploy');
  console.log('  --dry-run              Build + emit + validate only');
  console.log('  --skip-build           Use existing .vista artifacts');
  console.log('  --force                Overwrite generated platform configs');
  console.log('  --help                 Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  vista deploy');
  console.log('  vista deploy --target vercel --prod');
  console.log('  vista deploy --target render --dry-run');
  console.log('');
}

async function runProductionBuild(cwd: string): Promise<void> {
  const vistaBin = path.join(__dirname, '..', '..', 'bin', 'vista.js');
  const result = spawnSync(process.execPath, [vistaBin, 'build'], {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error('[vista:deploy] Production build failed.');
  }
}

export async function runDeployCommand(
  flags: string[],
  options: RunDeployCommandOptions = {}
): Promise<number> {
  if (flags.includes('--help') || flags.includes('-h')) {
    printHelp();
    return 0;
  }

  const target = getFlagValue(flags, '--target');
  if (target === 'auto') {
    (options.error ?? console.error)(
      '[vista:deploy] --target auto cannot be passed explicitly. Omit --target to auto-detect.'
    );
    return 1;
  }

  if (target && !listKnownTargets().includes(target as ResolvedDeployTarget)) {
    (options.error ?? console.error)(
      `[vista:deploy] Unsupported target "${target}". Use one of: ${listKnownTargets().join(', ')}`
    );
    return 1;
  }

  const output = getFlagValue(flags, '--output');
  if (output && !['standalone', 'static', 'hybrid'].includes(output)) {
    (options.error ?? console.error)(
      `[vista:deploy] Unsupported output "${output}". Use one of: standalone, static, hybrid`
    );
    return 1;
  }

  const cwd = options.cwd ?? process.cwd();
  const dryRun = flags.includes('--dry-run');
  const skipBuild = flags.includes('--skip-build');
  const force = flags.includes('--force');
  const preview = flags.includes('--preview');
  const prod = !preview;

  if (!skipBuild && !fs.existsSync(path.join(cwd, 'package.json'))) {
    (options.error ?? console.error)('[vista:deploy] No package.json found in project root.');
    return 1;
  }

  try {
    const result = await runDeploy({
      cwd,
      target,
      output: output as 'standalone' | 'static' | 'hybrid' | undefined,
      dryRun,
      skipBuild,
      prod,
      preview,
      force,
      debug: Boolean(process.env.VISTA_DEBUG),
      log: options.log,
      warn: options.warn,
      error: options.error,
      build: runProductionBuild,
    });

    if (result.status === 'failed') {
      return 1;
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    (options.error ?? console.error)(message);
    return 1;
  }
}
