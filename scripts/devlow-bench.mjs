import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPTS_DIR, '..');
const RESULTS_DIR = join(REPO_ROOT, 'bench', 'results');
const ANSI_REGEX = /\u001b\[[0-9;]*m/g;
const READY_REGEX = /Ready in/i;
const LOCAL_URL_REGEX = /Local:\s*(?<url>https?:\/\/[^\s]+)/i;
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const BENCHMARKS = [
  {
    id: 'app-router-server',
    title: 'App Router Server',
    dir: join(REPO_ROOT, 'bench', 'app-router-server'),
    pagePath: '/rsc',
    driver: 'standard',
    hmr: null,
  },
  {
    id: 'basic-app',
    title: 'Basic App',
    dir: join(REPO_ROOT, 'bench', 'basic-app'),
    pagePath: '/',
    driver: 'standard',
    hmr: {
      file: 'app/page.js',
      token: '__HMR_MARKER__',
    },
  },
  {
    id: 'fuzzponent',
    title: 'Fuzzponent Utility',
    dir: join(REPO_ROOT, 'bench', 'fuzzponent'),
    pagePath: '/',
    driver: 'utility',
    hmr: null,
  },
  {
    id: 'heavy-npm-deps',
    title: 'Heavy NPM Deps',
    dir: join(REPO_ROOT, 'bench', 'heavy-npm-deps'),
    pagePath: '/',
    driver: 'standard',
    hmr: {
      file: 'app/page.js',
      token: '__HMR_MARKER__',
    },
  },
  {
    id: 'module-cost',
    title: 'Module Cost',
    dir: join(REPO_ROOT, 'bench', 'module-cost'),
    pagePath: '/',
    driver: 'standard',
    hmr: null,
  },
  {
    id: 'nested-deps',
    title: 'Nested Deps',
    dir: join(REPO_ROOT, 'bench', 'nested-deps'),
    pagePath: '/',
    driver: 'standard',
    hmr: null,
  },
  {
    id: 'nested-deps-app-router',
    title: 'Nested Deps App Router',
    dir: join(REPO_ROOT, 'bench', 'nested-deps-app-router'),
    pagePath: '/server-components-only',
    driver: 'standard',
    hmr: null,
  },
  {
    id: 'nested-deps-app-router-many-pages',
    title: 'Nested Deps App Router Many Pages',
    dir: join(REPO_ROOT, 'bench', 'nested-deps-app-router-many-pages'),
    pagePath: '/',
    driver: 'standard',
    hmr: null,
  },
  {
    id: 'vista-minimal-server',
    title: 'Minimal Server Utility',
    dir: join(REPO_ROOT, 'bench', 'vista-minimal-server'),
    pagePath: '/',
    driver: 'utility',
    hmr: null,
  },
  {
    id: 'recursive-copy',
    title: 'Recursive Copy Utility',
    dir: join(REPO_ROOT, 'bench', 'recursive-copy'),
    pagePath: '/',
    driver: 'utility',
    hmr: null,
  },
  {
    id: 'recursive-delete',
    title: 'Recursive Delete Utility',
    dir: join(REPO_ROOT, 'bench', 'recursive-delete'),
    pagePath: '/',
    driver: 'utility',
    hmr: null,
  },
  {
    id: 'rendering',
    title: 'Rendering Utility',
    dir: join(REPO_ROOT, 'bench', 'rendering'),
    pagePath: '/',
    driver: 'utility',
    hmr: null,
  },
  {
    id: 'vercel',
    title: 'Vercel Utility',
    dir: join(REPO_ROOT, 'bench', 'vercel'),
    pagePath: '/',
    driver: 'utility',
    hmr: null,
  },
];

const VARIANT_ALIAS_MAP = {
  flashpack: 'flashpack',
  default: 'default',
  webpack: 'default',
};

function parseArgs(argv) {
  const args = {
    benchmarks: BENCHMARKS.map((entry) => entry.id),
    variants: ['flashpack', 'default'],
    mode: 'all',
    runs: 2,
    requests: 10,
    timeout: 90_000,
    portBase: 4500,
    install: true,
    list: false,
    jsonOut: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--benchmarks':
      case '--benchmark': {
        const value = argv[++i] || '';
        args.benchmarks = value.split(',').map((item) => item.trim()).filter(Boolean);
        break;
      }
      case '--variants': {
        const value = argv[++i] || '';
        args.variants = value.split(',').map((item) => item.trim()).filter(Boolean);
        break;
      }
      case '--mode':
        args.mode = argv[++i];
        break;
      case '--runs':
        args.runs = Number(argv[++i]);
        break;
      case '--requests':
        args.requests = Number(argv[++i]);
        break;
      case '--timeout':
        args.timeout = Number(argv[++i]);
        break;
      case '--port-base':
        args.portBase = Number(argv[++i]);
        break;
      case '--json-out':
        args.jsonOut = argv[++i];
        break;
      case '--skip-install':
        args.install = false;
        break;
      case '--list':
        args.list = true;
        break;
      default:
        if (token.startsWith('-')) {
          throw new Error(`Unknown flag: ${token}`);
        }
    }
  }

  if (!['all', 'dev', 'build'].includes(args.mode)) {
    throw new Error('--mode must be one of: all, dev, build');
  }
  if (!Number.isFinite(args.runs) || args.runs < 1) {
    throw new Error('--runs must be a positive integer');
  }
  if (!Number.isFinite(args.requests) || args.requests < 1) {
    throw new Error('--requests must be a positive integer');
  }
  if (!Number.isFinite(args.timeout) || args.timeout < 1_000) {
    throw new Error('--timeout must be at least 1000');
  }
  if (!Number.isFinite(args.portBase) || args.portBase < 1024) {
    throw new Error('--port-base must be >= 1024');
  }

  return args;
}

function stripAnsi(value) {
  return value.replace(ANSI_REGEX, '');
}

function summarize(values) {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const percentile = (p) => {
    const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
    return sorted[index];
  };

  return {
    count: sorted.length,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    avgMs: sum / sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
  };
}

function formatMs(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${value.toFixed(1)}ms`;
}

function listBenchmarks() {
  console.log('Available benchmarks:');
  for (const benchmark of BENCHMARKS) {
    console.log(`- ${benchmark.id}: ${benchmark.title} (${benchmark.driver})`);
  }
}

function getBenchmarkById(id) {
  return BENCHMARKS.find((entry) => entry.id === id) || null;
}

function normalizeBenchmarkSelection(ids) {
  const selected = [];
  for (const id of ids) {
    const benchmark = getBenchmarkById(id);
    if (!benchmark) {
      throw new Error(`Unknown benchmark "${id}". Use --list to see available benchmarks.`);
    }
    selected.push(benchmark);
  }
  return selected;
}

function normalizeVariants(rawVariants) {
  const variants = [];
  for (const value of rawVariants) {
    const normalized = VARIANT_ALIAS_MAP[value];
    if (!normalized) {
      throw new Error(
        `Unknown variant "${value}". Allowed: flashpack, default (legacy alias: webpack).`
      );
    }
    if (!variants.includes(normalized)) variants.push(normalized);
  }
  if (!variants.length) {
    throw new Error('At least one variant is required.');
  }
  return variants;
}

const benchmarkScriptCache = new Map();

async function loadBenchmarkScripts(benchmarkDir) {
  if (benchmarkScriptCache.has(benchmarkDir)) {
    return benchmarkScriptCache.get(benchmarkDir);
  }

  const packageJsonPath = join(benchmarkDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    benchmarkScriptCache.set(benchmarkDir, {});
    return {};
  }

  const content = await readFile(packageJsonPath, 'utf8');
  const parsed = JSON.parse(content);
  const scripts = parsed?.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  benchmarkScriptCache.set(benchmarkDir, scripts);
  return scripts;
}

function scriptCandidates(phase, variant) {
  if (phase === 'dev' && variant === 'flashpack') {
    return ['dev-flashpack', 'dev-application', 'dev'];
  }
  if (phase === 'dev' && variant === 'default') {
    return ['dev-default', 'dev-webpack'];
  }
  if (phase === 'build' && variant === 'flashpack') {
    return ['build-flashpack', 'build-application', 'build'];
  }
  if (phase === 'build' && variant === 'default') {
    return ['build-default', 'build-webpack'];
  }
  if (phase === 'start' && variant === 'flashpack') {
    return ['start-flashpack', 'start-application', 'start'];
  }
  if (phase === 'start' && variant === 'default') {
    return ['start-default', 'start-webpack'];
  }
  return [];
}

async function resolveScriptName(benchmarkDir, phase, variant) {
  const scripts = await loadBenchmarkScripts(benchmarkDir);
  const candidates = scriptCandidates(phase, variant);
  for (const script of candidates) {
    if (typeof scripts[script] === 'string' && scripts[script].trim().length > 0) {
      return script;
    }
  }

  throw new Error(
    `Missing ${phase} script for variant "${variant}" in ${benchmarkDir}. ` +
      `Expected one of: ${candidates.join(', ')}`
  );
}

async function runCommand(command, args, options) {
  const startedAt = performance.now();
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (options.streamOutput) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (options.streamOutput) process.stderr.write(chunk);
    });

    child.on('error', (error) => rejectPromise(error));
    child.on('close', (code, signal) => {
      const durationMs = performance.now() - startedAt;
      if (code !== 0) {
        const error = new Error(
          `Command failed: ${command} ${args.join(' ')} (code=${code}, signal=${signal || 'none'})`
        );
        error.code = code;
        error.signal = signal;
        error.stdout = stdout;
        error.stderr = stderr;
        error.durationMs = durationMs;
        rejectPromise(error);
        return;
      }

      resolvePromise({
        stdout,
        stderr,
        durationMs,
      });
    });
  });
}

async function runNpmScript(cwd, scriptName, env) {
  return runCommand(NPM_CMD, ['run', scriptName], { cwd, env });
}

async function ensureInstalled(benchmarkDir) {
  const nodeModulesDir = join(benchmarkDir, 'node_modules');
  if (existsSync(nodeModulesDir)) return;
  await runCommand(NPM_CMD, ['install', '--no-audit', '--no-fund'], {
    cwd: benchmarkDir,
    env: process.env,
    streamOutput: true,
  });
}

async function cleanupBenchmarkArtifacts(benchmarkDir) {
  await rm(join(benchmarkDir, '.vista'), { recursive: true, force: true });
  await rm(join(benchmarkDir, '.next'), { recursive: true, force: true });
}

async function startServer(scriptName, benchmarkDir, env, timeoutMs) {
  const child = spawn(NPM_CMD, ['run', scriptName], {
    cwd: benchmarkDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let output = '';
  let localUrl = '';
  let settled = false;

  const ready = await new Promise((resolvePromise, rejectPromise) => {
    const resolveReady = (payload) => {
      if (settled) return;
      settled = true;
      resolvePromise(payload);
    };
    const rejectReady = (error) => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    };

    const timeout = setTimeout(() => {
      rejectReady(
        new Error(
          `Timed out waiting for server readiness (${scriptName}) after ${timeoutMs}ms.\n${stripAnsi(output)}`
        )
      );
    }, timeoutMs);

    const onData = (chunk) => {
      output += chunk.toString();
      const plain = stripAnsi(output);
      const urlMatch = plain.match(LOCAL_URL_REGEX);
      if (urlMatch?.groups?.url) {
        localUrl = urlMatch.groups.url.trim();
      }
      if (READY_REGEX.test(plain)) {
        clearTimeout(timeout);
        resolveReady({ child, output: plain, localUrl });
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectReady(error);
    });

    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      rejectReady(
        new Error(
          `Server exited before ready (${scriptName}) code=${code} signal=${signal || 'none'}.\n${stripAnsi(output)}`
        )
      );
    });
  });

  return ready;
}

async function stopServer(child) {
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
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolvePromise();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

async function requestOnce(url, timeoutMs, wantText = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    const body = wantText ? await response.text() : await response.arrayBuffer();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return {
      durationMs: performance.now() - startedAt,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestLoop(url, count, timeoutMs) {
  const timings = [];
  for (let index = 0; index < count; index += 1) {
    const result = await requestOnce(url, timeoutMs, false);
    timings.push(result.durationMs);
  }
  return timings;
}

async function measureHmrLatency(benchmark, benchmarkUrl, timeoutMs) {
  if (!benchmark.hmr) return null;

  const filePath = join(benchmark.dir, benchmark.hmr.file);
  const original = await readFile(filePath, 'utf8');
  const marker = `hmr-${Date.now()}`;
  const next = original.replace(benchmark.hmr.token, marker);
  if (next === original) {
    throw new Error(`HMR token "${benchmark.hmr.token}" not found in ${benchmark.hmr.file}`);
  }

  await writeFile(filePath, next, 'utf8');
  const startedAt = performance.now();

  try {
    while (performance.now() - startedAt < timeoutMs) {
      try {
        const result = await requestOnce(benchmarkUrl, timeoutMs, true);
        const content = typeof result.body === 'string' ? result.body : '';
        if (content.includes(marker)) {
          return performance.now() - startedAt;
        }
      } catch {
        // Keep polling until timeout.
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    }
    throw new Error(`HMR update was not visible within ${timeoutMs}ms for ${benchmark.id}`);
  } finally {
    await writeFile(filePath, original, 'utf8');
  }
}

function initMetricBuckets() {
  return {
    dev: {
      startupMs: [],
      startupWithCacheMs: [],
      requestMs: [],
      requestWithCacheMs: [],
      hmrMs: [],
    },
    build: {
      buildMs: [],
      buildWithCacheMs: [],
      startupMs: [],
      requestMs: [],
    },
  };
}

async function runDevBenchmarkForVariant(benchmark, variant, args, portSeed, metrics) {
  const devScript = await resolveScriptName(benchmark.dir, 'dev', variant);

  for (let run = 0; run < args.runs; run += 1) {
    const port = portSeed + run;
    const env = { ...process.env, PORT: String(port), NODE_ENV: 'development' };
    const fallbackUrl = `http://localhost:${port}${benchmark.pagePath}`;

    await cleanupBenchmarkArtifacts(benchmark.dir);
    const startupStart = performance.now();
    let server = null;
    try {
      server = await startServer(devScript, benchmark.dir, env, args.timeout);
      metrics.dev.startupMs.push(performance.now() - startupStart);
      const url = `${server.localUrl || `http://localhost:${port}`}${benchmark.pagePath}`;
      const requestTimings = await requestLoop(url, args.requests, args.timeout);
      metrics.dev.requestMs.push(...requestTimings);

      const hmrLatency = await measureHmrLatency(benchmark, url, args.timeout);
      if (typeof hmrLatency === 'number') {
        metrics.dev.hmrMs.push(hmrLatency);
      }
    } finally {
      await stopServer(server?.child);
    }

    const startupWithCacheStart = performance.now();
    try {
      server = await startServer(devScript, benchmark.dir, env, args.timeout);
      metrics.dev.startupWithCacheMs.push(performance.now() - startupWithCacheStart);
      const url = `${server.localUrl || `http://localhost:${port}`}${benchmark.pagePath}`;
      const requestTimings = await requestLoop(url, args.requests, args.timeout);
      metrics.dev.requestWithCacheMs.push(...requestTimings);
    } catch {
      const requestTimings = await requestLoop(fallbackUrl, 1, args.timeout);
      metrics.dev.requestWithCacheMs.push(...requestTimings);
      throw new Error(`Failed to complete cached dev startup for ${benchmark.id}/${variant}`);
    } finally {
      await stopServer(server?.child);
    }
  }
}

async function runBuildBenchmarkForVariant(benchmark, variant, args, portSeed, metrics) {
  const buildScript = await resolveScriptName(benchmark.dir, 'build', variant);
  const startScript = await resolveScriptName(benchmark.dir, 'start', variant);

  for (let run = 0; run < args.runs; run += 1) {
    const port = portSeed + run;
    const env = { ...process.env, PORT: String(port), NODE_ENV: 'production' };

    await cleanupBenchmarkArtifacts(benchmark.dir);

    const build = await runNpmScript(benchmark.dir, buildScript, env);
    metrics.build.buildMs.push(build.durationMs);

    const buildWithCache = await runNpmScript(benchmark.dir, buildScript, env);
    metrics.build.buildWithCacheMs.push(buildWithCache.durationMs);

    const startupStart = performance.now();
    let server = null;
    try {
      server = await startServer(startScript, benchmark.dir, env, args.timeout);
      metrics.build.startupMs.push(performance.now() - startupStart);
      const url = `${server.localUrl || `http://localhost:${port}`}${benchmark.pagePath}`;
      const requestTimings = await requestLoop(url, args.requests, args.timeout);
      metrics.build.requestMs.push(...requestTimings);
    } finally {
      await stopServer(server?.child);
    }
  }
}

function printMetricSummary(label, values) {
  const summary = summarize(values);
  if (!summary) return;
  console.log(`    ${label}: avg ${formatMs(summary.avgMs)}, p50 ${formatMs(summary.p50Ms)}, p95 ${formatMs(summary.p95Ms)}`);
}

function timestampForFilename() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    listBenchmarks();
    return;
  }

  const selectedBenchmarks = normalizeBenchmarkSelection(args.benchmarks);
  const selectedVariants = normalizeVariants(args.variants);

  console.log('\nVista Devlow Bench');
  console.log(`Benchmarks: ${selectedBenchmarks.map((entry) => entry.id).join(', ')}`);
  console.log(`Variants: ${selectedVariants.join(', ')}`);
  console.log(`Mode: ${args.mode}`);
  console.log(`Runs: ${args.runs}`);
  console.log(`Requests: ${args.requests}`);
  console.log(`Node: ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}, CPUs: ${os.cpus().length}`);

  const startedAt = new Date().toISOString();
  const report = {
    startedAt,
    finishedAt: null,
    config: args,
    system: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'unknown',
      totalMemBytes: os.totalmem(),
    },
    benchmarks: {},
  };

  for (let benchmarkIndex = 0; benchmarkIndex < selectedBenchmarks.length; benchmarkIndex += 1) {
    const benchmark = selectedBenchmarks[benchmarkIndex];
    if (!existsSync(benchmark.dir)) {
      throw new Error(`Benchmark directory not found: ${benchmark.dir}`);
    }

    if (args.install && benchmark.driver === 'standard') {
      console.log(`\n[${benchmark.id}] Installing dependencies if needed...`);
      await ensureInstalled(benchmark.dir);
    }

    report.benchmarks[benchmark.id] = {};
    for (let variantIndex = 0; variantIndex < selectedVariants.length; variantIndex += 1) {
      const variant = selectedVariants[variantIndex];
      const portSeed = args.portBase + benchmarkIndex * 100 + variantIndex * 20;
      const metrics = initMetricBuckets();

      console.log(`\n[${benchmark.id}] Variant: ${variant}`);
      if (benchmark.driver !== 'standard') {
        console.log('  Skipping runtime benchmark for utility fixture.');
        report.benchmarks[benchmark.id][variant] = {
          skipped: true,
          reason: 'utility fixture does not use standard dev/build/start scripts',
          raw: metrics,
          summary: {
            dev: {
              startup: null,
              startupWithCache: null,
              request: null,
              requestWithCache: null,
              hmr: null,
            },
            build: {
              build: null,
              buildWithCache: null,
              startup: null,
              request: null,
            },
          },
        };
        continue;
      }

      if (args.mode === 'all' || args.mode === 'dev') {
        console.log('  Running dev benchmark...');
        await runDevBenchmarkForVariant(benchmark, variant, args, portSeed, metrics);
      }
      if (args.mode === 'all' || args.mode === 'build') {
        console.log('  Running build benchmark...');
        await runBuildBenchmarkForVariant(
          benchmark,
          variant,
          args,
          portSeed + 10,
          metrics
        );
      }

      report.benchmarks[benchmark.id][variant] = {
        raw: metrics,
        summary: {
          dev: {
            startup: summarize(metrics.dev.startupMs),
            startupWithCache: summarize(metrics.dev.startupWithCacheMs),
            request: summarize(metrics.dev.requestMs),
            requestWithCache: summarize(metrics.dev.requestWithCacheMs),
            hmr: summarize(metrics.dev.hmrMs),
          },
          build: {
            build: summarize(metrics.build.buildMs),
            buildWithCache: summarize(metrics.build.buildWithCacheMs),
            startup: summarize(metrics.build.startupMs),
            request: summarize(metrics.build.requestMs),
          },
        },
      };

      const summary = report.benchmarks[benchmark.id][variant].summary;
      if (args.mode === 'all' || args.mode === 'dev') {
        printMetricSummary('dev/startup', metrics.dev.startupMs);
        printMetricSummary('dev/startup-with-cache', metrics.dev.startupWithCacheMs);
        printMetricSummary('dev/request', metrics.dev.requestMs);
        printMetricSummary('dev/request-with-cache', metrics.dev.requestWithCacheMs);
        printMetricSummary('dev/hmr', metrics.dev.hmrMs);
      }
      if (args.mode === 'all' || args.mode === 'build') {
        printMetricSummary('build/build', metrics.build.buildMs);
        printMetricSummary('build/build-with-cache', metrics.build.buildWithCacheMs);
        printMetricSummary('build/startup', metrics.build.startupMs);
        printMetricSummary('build/request', metrics.build.requestMs);
      }

      report.benchmarks[benchmark.id][variant].summary = summary;
    }
  }

  report.finishedAt = new Date().toISOString();
  await mkdir(RESULTS_DIR, { recursive: true });
  const outputPath = args.jsonOut
    ? resolve(REPO_ROOT, args.jsonOut)
    : join(RESULTS_DIR, `devlow-${timestampForFilename()}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\nSaved benchmark report: ${outputPath.replace(`${REPO_ROOT}\\`, '').replace(`${REPO_ROOT}/`, '')}`);
}

main().catch((error) => {
  console.error('\nBenchmark failed.\n');
  console.error(error?.stack || error);
  process.exit(1);
});
