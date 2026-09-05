import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { generateRequiredServerFilesManifest, writeArtifactManifest } from './manifest';
import type { ServerManifest } from './rsc/server-manifest';

export interface RuntimeArtifactsManifest {
  schemaVersion: number;
  buildId: string;
  generatedAt: string;
  runtimeRootRelative: string;
  frameworkRuntimeRelative: string;
  standaloneServerRelative: string;
  fileTraceRelative: string;
  dependencyRootsRelative: string[];
}

export interface FileTraceManifest {
  schemaVersion: number;
  buildId: string;
  generatedAt: string;
  projectRoot: string;
  runtimeRootRelative: string;
  frameworkRuntimeRelative: string;
  copiedFiles: string[];
  copiedDirectories: string[];
  rewrittenArtifacts: string[];
}

interface StandaloneOutputOptions {
  cwd: string;
  vistaDir: string;
  buildId: string;
  serverManifest: ServerManifest;
  debug?: boolean;
}

interface PathRewriteContext {
  projectRoot: string;
  runtimeRoot: string;
  frameworkDistRoot: string;
  frameworkRuntimeRoot: string;
}

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.vista',
  '.flash',
  '.turbo',
  '.next',
  '.vercel',
  'node_modules',
  'coverage',
]);

const EXCLUDED_FILE_SUFFIXES = ['.log', '.tsbuildinfo'];

function ensureDir(absolutePath: string): void {
  fs.mkdirSync(absolutePath, { recursive: true });
}

function isExcludedDirectory(name: string): boolean {
  return EXCLUDED_DIRECTORIES.has(name);
}

function isExcludedFile(name: string): boolean {
  return EXCLUDED_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function copyDirectoryRecursive(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      copyDirectoryRecursive(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    ensureDir(targetDir);
    fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
  }
}

function copyProjectSnapshot(
  sourceRoot: string,
  targetRoot: string
): { copiedFiles: string[]; copiedDirectories: string[] } {
  const copiedFiles: string[] = [];
  const copiedDirectories: string[] = [];

  const visit = (currentSource: string, currentTarget: string): void => {
    ensureDir(currentTarget);
    const relativeDir = path.relative(sourceRoot, currentSource) || '.';
    copiedDirectories.push(relativeDir.replace(/\\/g, '/'));

    for (const entry of fs.readdirSync(currentSource, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (isExcludedDirectory(entry.name)) {
          continue;
        }
        visit(path.join(currentSource, entry.name), path.join(currentTarget, entry.name));
        continue;
      }

      if (!entry.isFile() || isExcludedFile(entry.name)) {
        continue;
      }

      const sourceFile = path.join(currentSource, entry.name);
      const targetFile = path.join(currentTarget, entry.name);
      ensureDir(path.dirname(targetFile));
      fs.copyFileSync(sourceFile, targetFile);
      copiedFiles.push(path.relative(sourceRoot, sourceFile).replace(/\\/g, '/'));
    }
  };

  visit(sourceRoot, targetRoot);
  copiedFiles.sort();
  copiedDirectories.sort();
  return { copiedFiles, copiedDirectories };
}

function resolveFrameworkDistRoot(cwd: string): string {
  const candidates: string[] = [];

  try {
    const packageJsonPath = require.resolve('@vistagenic/vista/package.json', { paths: [cwd] });
    candidates.push(path.join(path.dirname(packageJsonPath), 'dist'));
  } catch {
    // fall through
  }

  candidates.push(path.resolve(__dirname, '..', '..', 'dist'));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('[vista:build] Unable to locate the Vista runtime dist directory.');
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function rebaseAbsolutePath(absolutePath: string, context: PathRewriteContext): string {
  const normalizedAbsolute = path.resolve(absolutePath);

  if (isWithinRoot(normalizedAbsolute, context.projectRoot)) {
    return path.join(context.runtimeRoot, path.relative(context.projectRoot, normalizedAbsolute));
  }

  if (isWithinRoot(normalizedAbsolute, context.frameworkDistRoot)) {
    return path.join(
      context.frameworkRuntimeRoot,
      path.relative(context.frameworkDistRoot, normalizedAbsolute)
    );
  }

  return absolutePath;
}

function rewriteStringValue(value: string, context: PathRewriteContext): string {
  if (value.startsWith('file://')) {
    try {
      const parsed = new URL(value);
      const preserveEmptyHash = value.endsWith('#') && parsed.hash === '';
      const decoded = fileURLToPath(parsed);
      const rebased = rebaseAbsolutePath(decoded, context);
      if (rebased === decoded) {
        return value;
      }

      const nextUrl = pathToFileURL(rebased);
      nextUrl.hash = parsed.hash;
      const rewritten = nextUrl
        .toString()
        .replace(/^file:\/\/\/([A-Z]):/, (_match, driveLetter: string) => {
          return `file:///${driveLetter.toLowerCase()}:`;
        });
      return preserveEmptyHash && !rewritten.endsWith('#') ? `${rewritten}#` : rewritten;
    } catch {
      return value;
    }
  }

  if (!path.isAbsolute(value)) {
    return value;
  }

  const rebased = rebaseAbsolutePath(value, context);
  if (rebased === value) {
    return value;
  }

  if (value.includes('\\')) {
    return rebased;
  }

  return rebased.replace(/\\/g, '/');
}

function rewriteManifestValue(value: unknown, context: PathRewriteContext): unknown {
  if (typeof value === 'string') {
    return rewriteStringValue(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => rewriteManifestValue(entry, context));
  }

  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
      const nextKey = rewriteStringValue(rawKey, context);
      next[nextKey] = rewriteManifestValue(rawValue, context);
    }
    return next;
  }

  return value;
}

function writeJsonFile(absolutePath: string, payload: unknown): void {
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, JSON.stringify(payload, null, 2));
}

function writeStandaloneServerEntry(standaloneDir: string): void {
  const serverEntry = `#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const Module = require('module');

function normalizeEngine(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'flashpack') return 'flashpack';
  if (raw === 'default' || raw === 'webpack') return 'default';
  return 'default';
}

function readRuntimeManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, '.vista', 'server', 'runtime-manifest.json');
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

function findRepoBoundary(startDir) {
  let current = startDir;
  while (true) {
    if (
      fs.existsSync(path.join(current, '.git')) ||
      fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function installDependencyRoots(projectRoot, manifest) {
  const repoBoundary = findRepoBoundary(projectRoot);
  if (repoBoundary) {
    const originalNodeModulePaths = Module._nodeModulePaths;
    Module._nodeModulePaths = function (from) {
      const paths = originalNodeModulePaths.call(this, from);
      return paths.filter((p) => p.startsWith(repoBoundary));
    };
    if (Array.isArray(module.paths)) {
      module.paths = Module._nodeModulePaths(projectRoot);
    }
  }

  const candidates = [];

  for (const relativePath of manifest?.dependencyRootsRelative || []) {
    candidates.push(path.resolve(projectRoot, relativePath));
  }

  let current = projectRoot;
  while (true) {
    candidates.push(path.join(current, 'node_modules'));
    if (repoBoundary && current === repoBoundary) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const existing = candidates.filter((entry) => fs.existsSync(entry));
  if (existing.length === 0) {
    return;
  }

  const currentNodePath = process.env.NODE_PATH
    ? process.env.NODE_PATH.split(path.delimiter).filter(Boolean)
    : [];
  const merged = Array.from(new Set([...existing, ...currentNodePath]));
  process.env.NODE_PATH = merged.join(path.delimiter);
  Module._initPaths();
}

function startStandaloneServer(options = {}) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const runtimeRoot = path.join(__dirname, 'project');
  const runtimeManifest = readRuntimeManifest(projectRoot);
  const engine = normalizeEngine(
    options.engine ||
      process.env.VISTA_ENGINE ||
      process.env.VISTA_ENGINE_VARIANT ||
      (process.env.VISTA_FLASHPACK === 'true' ? 'flashpack' : '')
  );

  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.VISTA_ENGINE = engine;
  process.env.VISTA_ENGINE_VARIANT = engine;
  process.env.VISTA_FLASHPACK = engine === 'flashpack' ? 'true' : 'false';
  process.env.VISTA_RUNTIME_ROOT = runtimeRoot;
  process.env.VISTA_ARTIFACT_ROOT = projectRoot;
  installDependencyRoots(projectRoot, runtimeManifest);

  const runtimeEntry =
    engine === 'flashpack'
      ? path.join(__dirname, 'runtime', 'vista', 'server', 'rsc-engine-flashpack.js')
      : path.join(__dirname, 'runtime', 'vista', 'server', 'rsc-engine.js');
  const runtime = require(runtimeEntry);
  const start = runtime.startRSCServer || runtime.default;
  start({
    port: options.port || process.env.PORT || 3003,
    projectRoot,
    runtimeRoot,
  });
}

module.exports = { startStandaloneServer };

if (require.main === module) {
  startStandaloneServer();
}
`;

  fs.writeFileSync(path.join(standaloneDir, 'server.js'), serverEntry, 'utf-8');
}

export function generateStandaloneOutput(options: StandaloneOutputOptions): void {
  const { cwd, vistaDir, buildId, serverManifest, debug = false } = options;
  const standaloneDir = path.join(vistaDir, 'standalone');
  const runtimeProjectRoot = path.join(standaloneDir, 'project');
  const frameworkRuntimeRoot = path.join(standaloneDir, 'runtime', 'vista');
  const runtimeManifestPath = path.join(vistaDir, 'server', 'runtime-manifest.json');
  const fileTracePath = path.join(vistaDir, 'server', 'file-trace.json');

  fs.rmSync(standaloneDir, { recursive: true, force: true });
  ensureDir(standaloneDir);

  const snapshotTrace = copyProjectSnapshot(cwd, runtimeProjectRoot);
  const frameworkDistRoot = resolveFrameworkDistRoot(cwd);
  copyDirectoryRecursive(frameworkDistRoot, frameworkRuntimeRoot);
  writeStandaloneServerEntry(standaloneDir);

  const rewriteContext: PathRewriteContext = {
    projectRoot: cwd,
    runtimeRoot: runtimeProjectRoot,
    frameworkDistRoot,
    frameworkRuntimeRoot,
  };

  const rebasedServerManifest = rewriteManifestValue(
    serverManifest,
    rewriteContext
  ) as ServerManifest;
  writeJsonFile(path.join(vistaDir, 'server', 'server-manifest.json'), rebasedServerManifest);

  const manifestFiles = [
    'client-manifest.json',
    'app-path-routes-manifest.json',
    'routes-manifest.json',
    'react-client-manifest.json',
    'react-server-manifest.json',
    'react-ssr-manifest.json',
  ];
  const rewrittenArtifacts: string[] = ['server/server-manifest.json'];

  for (const relativePath of manifestFiles) {
    const absolutePath = path.join(vistaDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const payload = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
    writeJsonFile(absolutePath, rewriteManifestValue(payload, rewriteContext));
    rewrittenArtifacts.push(relativePath);
  }

  const runtimeManifest: RuntimeArtifactsManifest = {
    schemaVersion: 1,
    buildId,
    generatedAt: new Date().toISOString(),
    runtimeRootRelative: path.relative(cwd, runtimeProjectRoot).replace(/\\/g, '/'),
    frameworkRuntimeRelative: path.relative(cwd, frameworkRuntimeRoot).replace(/\\/g, '/'),
    standaloneServerRelative: path
      .relative(cwd, path.join(standaloneDir, 'server.js'))
      .replace(/\\/g, '/'),
    fileTraceRelative: path.relative(cwd, fileTracePath).replace(/\\/g, '/'),
    dependencyRootsRelative: [],
  };

  const frameworkNodeModules = path.join(path.dirname(frameworkDistRoot), 'node_modules');
  if (fs.existsSync(frameworkNodeModules)) {
    runtimeManifest.dependencyRootsRelative.push(
      path.relative(cwd, frameworkNodeModules).replace(/\\/g, '/')
    );
  }

  const fileTrace: FileTraceManifest = {
    schemaVersion: 1,
    buildId,
    generatedAt: new Date().toISOString(),
    projectRoot: cwd,
    runtimeRootRelative: runtimeManifest.runtimeRootRelative,
    frameworkRuntimeRelative: runtimeManifest.frameworkRuntimeRelative,
    copiedFiles: snapshotTrace.copiedFiles,
    copiedDirectories: snapshotTrace.copiedDirectories,
    rewrittenArtifacts,
  };

  writeJsonFile(runtimeManifestPath, runtimeManifest);
  writeJsonFile(fileTracePath, fileTrace);

  generateRequiredServerFilesManifest(
    cwd,
    vistaDir,
    [
      `${path.basename(vistaDir)}/server/runtime-manifest.json`,
      `${path.basename(vistaDir)}/server/file-trace.json`,
      `${path.basename(vistaDir)}/standalone/server.js`,
    ],
    runtimeProjectRoot
  );

  writeArtifactManifest(vistaDir, buildId, {
    serverManifest: 'server/server-manifest.json',
    runtimeManifest: 'server/runtime-manifest.json',
    fileTrace: 'server/file-trace.json',
    standaloneServer: 'standalone/server.js',
  });

  if (debug) {
    console.log(
      `[vista:build] Standalone output ready (${snapshotTrace.copiedFiles.length} files, ${snapshotTrace.copiedDirectories.length} directories)`
    );
  }
}
