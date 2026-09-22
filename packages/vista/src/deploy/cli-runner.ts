import { spawnSync } from 'child_process';

import type { CliRunResult } from './types';

function parseCommand(command: string): { bin: string; args: string[] } {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error('[vista:deploy] Empty CLI command.');
  }
  return { bin: parts[0], args: parts.slice(1) };
}

export function isCliAvailable(command: string): boolean {
  const { bin } = parseCommand(command);
  const which = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(which, [bin], { stdio: 'ignore' });
  return result.status === 0;
}

export function runCliCommand(
  command: string,
  options: { cwd: string; env?: NodeJS.ProcessEnv; dryRun?: boolean }
): CliRunResult {
  if (options.dryRun) {
    return {
      ok: true,
      stdout: '',
      stderr: '',
      command,
    };
  }

  const { bin, args } = parseCommand(command);
  if (!isCliAvailable(bin)) {
    return {
      ok: false,
      stdout: '',
      stderr: `CLI not found: ${bin}`,
      command,
      missingCli: true,
    };
  }

  const result = spawnSync(bin, args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    command,
    missingCli: false,
  };
}

export function extractDeploymentUrl(output: string): string | undefined {
  const match = output.match(/https?:\/\/[^\s]+/g);
  if (!match || match.length === 0) return undefined;
  return match[match.length - 1].replace(/[)\]'".,;:!?]+$/, '');
}
