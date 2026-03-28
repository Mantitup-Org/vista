#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flashRepoConfigPath = path.join(repoRoot, 'flashrepo.json');
const rootPackageJsonPath = path.join(repoRoot, 'package.json');
const repoLogRoot = path.join(repoRoot, '.flash', 'repo-logs');

function readJson(absolutePath) {
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function copyDirectoryContents(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(src, dest);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

function collectLegacyCacheDirs(rootDir, found = []) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    const absolute = path.join(rootDir, entry.name);
    if (entry.name === '.turbo') {
      found.push(absolute);
      continue;
    }

    collectLegacyCacheDirs(absolute, found);
  }

  return found;
}

function migrateLegacyCacheDirs() {
  const legacyDirs = collectLegacyCacheDirs(repoRoot);
  if (legacyDirs.length === 0) return;

  fs.mkdirSync(repoLogRoot, { recursive: true });

  for (const legacyDir of legacyDirs) {
    const ownerDir = path.dirname(legacyDir);
    const ownerRelative = path.relative(repoRoot, ownerDir) || 'root';
    const targetDir = path.join(repoLogRoot, ownerRelative);
    copyDirectoryContents(legacyDir, targetDir);
    fs.rmSync(legacyDir, { recursive: true, force: true });
  }
}

function removeLegacyFlashTurboDirs() {
  for (const legacyDir of [
    path.join(repoRoot, '.flash', 'turbo'),
    path.join(repoRoot, '.flash', 'cache', 'turbo'),
  ]) {
    if (!fs.existsSync(legacyDir)) continue;
    fs.rmSync(legacyDir, { recursive: true, force: true });
  }
}

function resolvePnpmPackageSpec() {
  const rootPackageJson = readJson(rootPackageJsonPath);
  const packageManager = String(rootPackageJson.packageManager || '').trim();
  return packageManager.startsWith('pnpm@') ? packageManager : 'pnpm';
}

function loadFlashRepoConfig() {
  return readJson(flashRepoConfigPath);
}

function normalizeTaskName(rawTask) {
  const taskName = String(rawTask || '').trim();
  if (!taskName) {
    throw new Error('Usage: node scripts/flash-run.cjs run <task> [...args]');
  }
  return taskName;
}

function buildRecursiveArgs(taskName, passthroughArgs) {
  const flashRepoConfig = loadFlashRepoConfig();
  const taskConfig = flashRepoConfig.tasks?.[taskName] || {};

  const pnpmArgs = [resolvePnpmPackageSpec(), '-r', '--stream'];
  if (taskConfig.ifPresent !== false) {
    pnpmArgs.push('--if-present');
  }
  if (taskConfig.parallel) {
    pnpmArgs.push('--parallel');
  }

  pnpmArgs.push(...passthroughArgs, 'run', taskName);
  return pnpmArgs;
}

try {
  migrateLegacyCacheDirs();
  removeLegacyFlashTurboDirs();
} catch (error) {
  console.warn(`[flash-run] cleanup warning: ${error.message}`);
}

const command = args[0];
const taskName = normalizeTaskName(args[1]);
const passthroughArgs = args.slice(2);

if (command !== 'run') {
  console.error('Usage: node scripts/flash-run.cjs run <task> [...args]');
  process.exit(1);
}

const result = spawnSync('npx', ['--yes', ...buildRecursiveArgs(taskName, passthroughArgs)], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
