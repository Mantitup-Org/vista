import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const SHARED_DIR = dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = resolve(SHARED_DIR, '..');
const REPO_ROOT = resolve(BENCH_DIR, '..');
const VISTA_BIN = join(REPO_ROOT, 'packages', 'vista', 'bin', 'vista.js');
const READY_REGEX = /Ready in/i;
const LOCAL_URL_REGEX = /Local:\s*(?<url>https?:\/\/[^\s]+)/i;

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function toUrl(origin, pagePath) {
  return new URL(pagePath, origin.endsWith('/') ? origin : `${origin}/`).toString();
}

async function runVistaCommand(cwd, args, env, timeoutMs = 120_000, streamOutput = false) {
  const child = spawn(process.execPath, [VISTA_BIN, ...args], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';

  return await new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(async () => {
      await stopChild(child);
      rejectPromise(new Error(`Timed out running vista ${args.join(' ')} in ${cwd}`));
    }, timeoutMs);

    const onStdout = (chunk) => {
      stdout += chunk.toString();
      if (streamOutput) process.stdout.write(chunk);
    };

    const onStderr = (chunk) => {
      stderr += chunk.toString();
      if (streamOutput) process.stderr.write(chunk);
    };

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        rejectPromise(
          new Error(
            `vista ${args.join(' ')} failed (code=${code}, signal=${signal || 'none'})\n${stripAnsi(stdout)}\n${stripAnsi(stderr)}`
          )
        );
        return;
      }

      resolvePromise({ stdout, stderr });
    });
  });
}

async function requestText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function requestTiming(url, timeoutMs) {
  const startedAt = performance.now();
  const body = await requestText(url, timeoutMs);
  return {
    body,
    durationMs: performance.now() - startedAt,
  };
}

async function waitForContent(url, expectedText, timeoutMs) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const body = await requestText(url, timeoutMs);
      if (body.includes(expectedText)) {
        return performance.now() - startedAt;
      }
    } catch {
      // Keep polling until timeout.
    }

    await waitFor(200);
  }

  throw new Error(`Timed out waiting for ${expectedText} at ${url}`);
}

export class TokenizedFile {
  constructor(filePath, token) {
    this.filePath = filePath;
    this.token = token;
    this.original = null;
  }

  async load() {
    if (this.original !== null) return;
    this.original = await readFile(this.filePath, 'utf8');
    if (!this.original.includes(this.token)) {
      throw new Error(`Token "${this.token}" not found in ${this.filePath}`);
    }
  }

  async set(marker) {
    await this.load();
    const next = this.original.replace(this.token, marker);
    await writeFile(this.filePath, next, 'utf8');
  }

  async restore() {
    if (this.original === null) return;
    await writeFile(this.filePath, this.original, 'utf8');
  }
}

export async function cleanupVistaArtifacts(cwd) {
  await Promise.all([
    rm(join(cwd, '.vista'), { recursive: true, force: true }),
    rm(join(cwd, '.flash'), { recursive: true, force: true }),
  ]);
}

export function formatMs(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${value.toFixed(1)}ms`;
}

export async function runVistaBuild({ cwd, extraArgs = [], timeoutMs = 120_000 }) {
  await cleanupVistaArtifacts(cwd);
  const startedAt = performance.now();
  await runVistaCommand(
    cwd,
    ['build', ...extraArgs],
    { ...process.env, NODE_ENV: 'production' },
    timeoutMs,
    true
  );
  const artifactPath = join(cwd, '.vista', 'artifact-manifest.json');
  if (!existsSync(artifactPath)) {
    throw new Error(`Expected Vista build artifact was not generated: ${artifactPath}`);
  }

  return {
    durationMs: performance.now() - startedAt,
    artifactPath,
  };
}

export async function runVistaDevEditBenchmark({
  cwd,
  pagePath,
  filePath,
  token,
  iterations = 3,
  port = 3000,
  extraArgs = [],
  timeoutMs = 120_000,
}) {
  await cleanupVistaArtifacts(cwd);
  const trackedFile = new TokenizedFile(filePath, token);
  let server = null;

  try {
    const startupStartedAt = performance.now();
    server = await startVistaServer({ cwd, port, extraArgs, timeoutMs });
    const startupMs = performance.now() - startupStartedAt;
    const url = toUrl(server.origin, pagePath);
    const initialRequest = await requestTiming(url, timeoutMs);
    const hmrMs = [];

    for (let index = 0; index < iterations; index += 1) {
      const marker = `${token}-${Date.now()}-${index}`;
      await trackedFile.set(marker);
      hmrMs.push(await waitForContent(url, marker, timeoutMs));
    }

    return {
      startupMs,
      initialRequestMs: initialRequest.durationMs,
      hmrMs,
      url,
    };
  } finally {
    await trackedFile.restore();
    await stopChild(server?.child);
  }
}

export async function startVistaServer({ cwd, port = 3000, extraArgs = [], timeoutMs = 120_000 }) {
  const child = spawn(process.execPath, [VISTA_BIN, 'dev', ...extraArgs], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let output = '';
  let localUrl = `http://localhost:${port}`;

  return await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const timeout = setTimeout(async () => {
      if (settled) return;
      settled = true;
      await stopChild(child);
      rejectPromise(
        new Error(`Timed out waiting for Vista dev server readiness in ${cwd}\n${stripAnsi(output)}`)
      );
    }, timeoutMs);

    const onData = (chunk) => {
      output += chunk.toString();
      const plain = stripAnsi(output);
      const matchedUrl = plain.match(LOCAL_URL_REGEX);
      if (matchedUrl?.groups?.url) {
        localUrl = matchedUrl.groups.url.trim();
      }

      if (READY_REGEX.test(plain) && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolvePromise({
          child,
          origin: localUrl,
          output: plain,
        });
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(
        new Error(
          `Vista dev server exited before ready (code=${code}, signal=${signal || 'none'})\n${stripAnsi(output)}`
        )
      );
    });
  });
}

export async function stopChild(child) {
  if (!child || child.exitCode !== null) return;

  if (process.platform === 'win32') {
    await new Promise((resolvePromise) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.on('error', () => resolvePromise());
      killer.on('close', () => resolvePromise());
    });
    return;
  }

  child.kill('SIGTERM');
  await new Promise((resolvePromise) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolvePromise();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

export async function waitFor(millis) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, millis));
}
