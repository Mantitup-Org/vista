#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const BENCH_ROOT = path.join(REPO_ROOT, 'bench');

const REQUIRED_BENCHMARKS = [
  'app-router-server',
  'basic-app',
  'fuzzponent',
  'heavy-npm-deps',
  'module-cost',
  'nested-deps',
  'nested-deps-app-router',
  'nested-deps-app-router-many-pages',
  'vista-minimal-server',
  'recursive-copy',
  'recursive-delete',
  'rendering',
  'vercel',
];

const STANDARD_BENCHMARKS = [
  'app-router-server',
  'basic-app',
  'heavy-npm-deps',
  'module-cost',
  'nested-deps',
  'nested-deps-app-router',
  'nested-deps-app-router-many-pages',
];

const REQUIRED_ENGINE_SCRIPTS = [
  'dev-flashpack',
  'dev-default',
  'build-flashpack',
  'build-default',
  'start-flashpack',
  'start-default',
  'build-application',
  'start-application',
];

const REQUIRED_FILES = {
  'app-router-server': [
    'app/layout.js',
    'app/rsc/page.js',
    'app/conformance/page.js',
    'app/conformance/[slug]/page.js',
    'app/conformance/actions-exported/page.js',
    'app/conformance/actions-inline/page.js',
    'app/conformance/cache-tag/page.js',
    'app/conformance/cache-path/page.js',
  ],
  'basic-app': ['app/layout.js', 'app/page.js'],
  'heavy-npm-deps': ['app/layout.js', 'app/page.js', 'components/lodash.js'],
  'module-cost': ['app/layout.js', 'app/app/page.js', 'scripts/benchmark-runner.mjs'],
  'nested-deps': ['pages/index.jsx'],
  'nested-deps-app-router': ['app/layout.js', 'app/server-components-only/page.js'],
  'nested-deps-app-router-many-pages': ['template/layout.js', 'template/root-layout.js'],
  'fuzzponent': ['bin/fuzzponent.js'],
  'vista-minimal-server': ['bin/minimal-server.js'],
  'recursive-copy': ['run.js'],
  'recursive-delete': ['recursive-delete.js', 'run.sh'],
  rendering: ['pages/stateless.js', 'pages/stateless-big.js'],
  vercel: ['bench.js', 'benchmark-app/package.json'],
};

const BANNED_BENCH_PATH_PATTERNS = [
  {
    label: 'next.config.*',
    test: (relativePath) => /(^|[\\/])next\.config\.[^\\/]+$/i.test(relativePath),
  },
];

const BANNED_BENCH_CONTENT_PATTERNS = [
  { label: 'NEXT_', pattern: /NEXT_/ },
  { label: '.next', pattern: /\.next\b/ },
  { label: 'next/dist', pattern: /next\/dist|next\\dist/ },
  { label: 'packages/next', pattern: /packages\/next|packages\\next/ },
  { label: 'required-server-files', pattern: /required-server-files/ },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function walkFiles(rootDir) {
  const files = [];
  const queue = [rootDir];

  while (queue.length) {
    const currentDir = queue.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.vista' ||
        entry.name === '.flash' ||
        entry.name === 'results'
      ) {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      files.push(absolutePath);
    }
  }

  return files;
}

function checkBenchDirectories() {
  for (const benchmarkId of REQUIRED_BENCHMARKS) {
    const benchDir = path.join(REPO_ROOT, 'bench', benchmarkId);
    assert(fs.existsSync(benchDir), `Missing benchmark directory: bench/${benchmarkId}`);
  }
}

function checkRequiredFiles() {
  for (const [benchmarkId, files] of Object.entries(REQUIRED_FILES)) {
    const benchDir = path.join(REPO_ROOT, 'bench', benchmarkId);
    for (const relPath of files) {
      const target = path.join(benchDir, relPath);
      assert(fs.existsSync(target), `Missing required benchmark file: bench/${benchmarkId}/${relPath}`);
    }
  }
}

function checkStandardBenchmarkPackages() {
  for (const benchmarkId of STANDARD_BENCHMARKS) {
    const benchDir = path.join(REPO_ROOT, 'bench', benchmarkId);
    const packageJsonPath = path.join(benchDir, 'package.json');
    assert(
      fs.existsSync(packageJsonPath),
      `Missing benchmark package.json: bench/${benchmarkId}/package.json`
    );

    const packageJson = readJson(packageJsonPath);
    assert(
      packageJson && typeof packageJson === 'object',
      `Invalid package.json in bench/${benchmarkId}`
    );
    assert(packageJson.scripts, `Missing scripts in bench/${benchmarkId}/package.json`);

    for (const scriptName of REQUIRED_ENGINE_SCRIPTS) {
      assert(
        typeof packageJson.scripts[scriptName] === 'string' &&
          packageJson.scripts[scriptName].trim().length > 0,
        `Missing required script "${scriptName}" in bench/${benchmarkId}/package.json`
      );
    }
  }
}

function checkRootPackageScripts() {
  const packageJson = readJson(path.join(REPO_ROOT, 'package.json'));
  assert(packageJson.scripts, 'Missing root scripts in package.json');
  assert(
    typeof packageJson.scripts.bench === 'string' &&
      packageJson.scripts.bench.includes('scripts/devlow-bench.mjs'),
    'Root script "bench" must call scripts/devlow-bench.mjs'
  );
  assert(
    typeof packageJson.scripts['bench:list'] === 'string' &&
      packageJson.scripts['bench:list'].includes('scripts/devlow-bench.mjs'),
    'Root script "bench:list" must call scripts/devlow-bench.mjs'
  );
  assert(
    typeof packageJson.scripts['test:bench'] === 'string' &&
      packageJson.scripts['test:bench'].includes('scripts/test-bench.cjs'),
    'Root script "test:bench" must call scripts/test-bench.cjs'
  );
}

function checkFlashGenerators() {
  const configPath = path.join(REPO_ROOT, 'flash', 'generators', 'config.ts');
  const helperPath = path.join(REPO_ROOT, 'flash', 'generators', 'helpers.ts');
  const flashGenScript = path.join(REPO_ROOT, 'scripts', 'flash-gen.cjs');

  assert(fs.existsSync(configPath), 'Missing flash generator config: flash/generators/config.ts');
  assert(fs.existsSync(helperPath), 'Missing flash helper file: flash/generators/helpers.ts');
  assert(fs.existsSync(flashGenScript), 'Missing flash generator CLI script: scripts/flash-gen.cjs');
}

function checkRunnerVariantNaming() {
  const runnerPath = path.join(REPO_ROOT, 'scripts', 'devlow-bench.mjs');
  const source = fs.readFileSync(runnerPath, 'utf8');
  assert(source.includes('flashpack'), 'Benchmark runner must expose "flashpack" variant');
  assert(source.includes('default'), 'Benchmark runner must expose "default" variant');
}

function checkNoLegacyNextArtifacts() {
  for (const absolutePath of walkFiles(BENCH_ROOT)) {
    const relativePath = path.relative(REPO_ROOT, absolutePath);

    for (const bannedPath of BANNED_BENCH_PATH_PATTERNS) {
      assert(
        !bannedPath.test(relativePath),
        `Legacy bench artifact "${bannedPath.label}" found at ${relativePath}`
      );
    }

    let source = '';
    try {
      source = fs.readFileSync(absolutePath, 'utf8');
    } catch {
      continue;
    }

    for (const bannedContent of BANNED_BENCH_CONTENT_PATTERNS) {
      assert(
        !bannedContent.pattern.test(source),
        `Legacy bench content "${bannedContent.label}" found in ${relativePath}`
      );
    }
  }
}

function main() {
  checkBenchDirectories();
  checkRequiredFiles();
  checkStandardBenchmarkPackages();
  checkRootPackageScripts();
  checkFlashGenerators();
  checkRunnerVariantNaming();
  checkNoLegacyNextArtifacts();
  console.log('Bench structure verification passed.');
}

try {
  main();
} catch (error) {
  console.error('Bench structure verification failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
