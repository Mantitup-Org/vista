"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStandaloneOutput = generateStandaloneOutput;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const manifest_1 = require("./manifest");
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
function ensureDir(absolutePath) {
    fs_1.default.mkdirSync(absolutePath, { recursive: true });
}
function isExcludedDirectory(name) {
    return EXCLUDED_DIRECTORIES.has(name);
}
function isExcludedFile(name) {
    return EXCLUDED_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}
function copyDirectoryRecursive(sourceDir, targetDir) {
    if (!fs_1.default.existsSync(sourceDir)) {
        return;
    }
    ensureDir(targetDir);
    for (const entry of fs_1.default.readdirSync(sourceDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            copyDirectoryRecursive(path_1.default.join(sourceDir, entry.name), path_1.default.join(targetDir, entry.name));
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        ensureDir(targetDir);
        fs_1.default.copyFileSync(path_1.default.join(sourceDir, entry.name), path_1.default.join(targetDir, entry.name));
    }
}
function copyProjectSnapshot(sourceRoot, targetRoot) {
    const copiedFiles = [];
    const copiedDirectories = [];
    const visit = (currentSource, currentTarget) => {
        ensureDir(currentTarget);
        const relativeDir = path_1.default.relative(sourceRoot, currentSource) || '.';
        copiedDirectories.push(relativeDir.replace(/\\/g, '/'));
        for (const entry of fs_1.default.readdirSync(currentSource, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (isExcludedDirectory(entry.name)) {
                    continue;
                }
                visit(path_1.default.join(currentSource, entry.name), path_1.default.join(currentTarget, entry.name));
                continue;
            }
            if (!entry.isFile() || isExcludedFile(entry.name)) {
                continue;
            }
            const sourceFile = path_1.default.join(currentSource, entry.name);
            const targetFile = path_1.default.join(currentTarget, entry.name);
            ensureDir(path_1.default.dirname(targetFile));
            fs_1.default.copyFileSync(sourceFile, targetFile);
            copiedFiles.push(path_1.default.relative(sourceRoot, sourceFile).replace(/\\/g, '/'));
        }
    };
    visit(sourceRoot, targetRoot);
    copiedFiles.sort();
    copiedDirectories.sort();
    return { copiedFiles, copiedDirectories };
}
function resolveFrameworkDistRoot(cwd) {
    const candidates = [];
    try {
        const packageJsonPath = require.resolve('@vistagenic/vista/package.json', { paths: [cwd] });
        candidates.push(path_1.default.join(path_1.default.dirname(packageJsonPath), 'dist'));
    }
    catch {
        // fall through
    }
    candidates.push(path_1.default.resolve(__dirname, '..', '..', 'dist'));
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error('[vista:build] Unable to locate the Vista runtime dist directory.');
}
function isWithinRoot(candidatePath, rootPath) {
    const relative = path_1.default.relative(rootPath, candidatePath);
    return relative === '' || (!relative.startsWith('..') && !path_1.default.isAbsolute(relative));
}
function rebaseAbsolutePath(absolutePath, context) {
    const normalizedAbsolute = path_1.default.resolve(absolutePath);
    if (isWithinRoot(normalizedAbsolute, context.projectRoot)) {
        return path_1.default.join(context.runtimeRoot, path_1.default.relative(context.projectRoot, normalizedAbsolute));
    }
    if (isWithinRoot(normalizedAbsolute, context.frameworkDistRoot)) {
        return path_1.default.join(context.frameworkRuntimeRoot, path_1.default.relative(context.frameworkDistRoot, normalizedAbsolute));
    }
    return absolutePath;
}
function rewriteStringValue(value, context) {
    if (value.startsWith('file://')) {
        try {
            const parsed = new URL(value);
            const preserveEmptyHash = value.endsWith('#') && parsed.hash === '';
            const decoded = (0, url_1.fileURLToPath)(parsed);
            const rebased = rebaseAbsolutePath(decoded, context);
            if (rebased === decoded) {
                return value;
            }
            const nextUrl = (0, url_1.pathToFileURL)(rebased);
            nextUrl.hash = parsed.hash;
            const rewritten = nextUrl
                .toString()
                .replace(/^file:\/\/\/([A-Z]):/, (_match, driveLetter) => {
                return `file:///${driveLetter.toLowerCase()}:`;
            });
            return preserveEmptyHash && !rewritten.endsWith('#') ? `${rewritten}#` : rewritten;
        }
        catch {
            return value;
        }
    }
    if (!path_1.default.isAbsolute(value)) {
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
function rewriteManifestValue(value, context) {
    if (typeof value === 'string') {
        return rewriteStringValue(value, context);
    }
    if (Array.isArray(value)) {
        return value.map((entry) => rewriteManifestValue(entry, context));
    }
    if (value && typeof value === 'object') {
        const next = {};
        for (const [rawKey, rawValue] of Object.entries(value)) {
            const nextKey = rewriteStringValue(rawKey, context);
            next[nextKey] = rewriteManifestValue(rawValue, context);
        }
        return next;
    }
    return value;
}
function writeJsonFile(absolutePath, payload) {
    ensureDir(path_1.default.dirname(absolutePath));
    fs_1.default.writeFileSync(absolutePath, JSON.stringify(payload, null, 2));
}
function writeStandaloneServerEntry(standaloneDir) {
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
    fs_1.default.writeFileSync(path_1.default.join(standaloneDir, 'server.js'), serverEntry, 'utf-8');
}
function generateStandaloneOutput(options) {
    const { cwd, vistaDir, buildId, serverManifest, debug = false } = options;
    const standaloneDir = path_1.default.join(vistaDir, 'standalone');
    const runtimeProjectRoot = path_1.default.join(standaloneDir, 'project');
    const frameworkRuntimeRoot = path_1.default.join(standaloneDir, 'runtime', 'vista');
    const runtimeManifestPath = path_1.default.join(vistaDir, 'server', 'runtime-manifest.json');
    const fileTracePath = path_1.default.join(vistaDir, 'server', 'file-trace.json');
    fs_1.default.rmSync(standaloneDir, { recursive: true, force: true });
    ensureDir(standaloneDir);
    const snapshotTrace = copyProjectSnapshot(cwd, runtimeProjectRoot);
    const frameworkDistRoot = resolveFrameworkDistRoot(cwd);
    copyDirectoryRecursive(frameworkDistRoot, frameworkRuntimeRoot);
    writeStandaloneServerEntry(standaloneDir);
    const rewriteContext = {
        projectRoot: cwd,
        runtimeRoot: runtimeProjectRoot,
        frameworkDistRoot,
        frameworkRuntimeRoot,
    };
    const rebasedServerManifest = rewriteManifestValue(serverManifest, rewriteContext);
    writeJsonFile(path_1.default.join(vistaDir, 'server', 'server-manifest.json'), rebasedServerManifest);
    const manifestFiles = [
        'client-manifest.json',
        'app-path-routes-manifest.json',
        'routes-manifest.json',
        'react-client-manifest.json',
        'react-server-manifest.json',
        'react-ssr-manifest.json',
    ];
    const rewrittenArtifacts = ['server/server-manifest.json'];
    for (const relativePath of manifestFiles) {
        const absolutePath = path_1.default.join(vistaDir, relativePath);
        if (!fs_1.default.existsSync(absolutePath)) {
            continue;
        }
        const payload = JSON.parse(fs_1.default.readFileSync(absolutePath, 'utf-8'));
        writeJsonFile(absolutePath, rewriteManifestValue(payload, rewriteContext));
        rewrittenArtifacts.push(relativePath);
    }
    const runtimeManifest = {
        schemaVersion: 1,
        buildId,
        generatedAt: new Date().toISOString(),
        runtimeRootRelative: path_1.default.relative(cwd, runtimeProjectRoot).replace(/\\/g, '/'),
        frameworkRuntimeRelative: path_1.default.relative(cwd, frameworkRuntimeRoot).replace(/\\/g, '/'),
        standaloneServerRelative: path_1.default
            .relative(cwd, path_1.default.join(standaloneDir, 'server.js'))
            .replace(/\\/g, '/'),
        fileTraceRelative: path_1.default.relative(cwd, fileTracePath).replace(/\\/g, '/'),
        dependencyRootsRelative: [],
    };
    const frameworkNodeModules = path_1.default.join(path_1.default.dirname(frameworkDistRoot), 'node_modules');
    if (fs_1.default.existsSync(frameworkNodeModules)) {
        runtimeManifest.dependencyRootsRelative.push(path_1.default.relative(cwd, frameworkNodeModules).replace(/\\/g, '/'));
    }
    const fileTrace = {
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
    (0, manifest_1.generateRequiredServerFilesManifest)(cwd, vistaDir, [
        `${path_1.default.basename(vistaDir)}/server/runtime-manifest.json`,
        `${path_1.default.basename(vistaDir)}/server/file-trace.json`,
        `${path_1.default.basename(vistaDir)}/standalone/server.js`,
    ], runtimeProjectRoot);
    (0, manifest_1.writeArtifactManifest)(vistaDir, buildId, {
        serverManifest: 'server/server-manifest.json',
        runtimeManifest: 'server/runtime-manifest.json',
        fileTrace: 'server/file-trace.json',
        standaloneServer: 'standalone/server.js',
    });
    if (debug) {
        console.log(`[vista:build] Standalone output ready (${snapshotTrace.copiedFiles.length} files, ${snapshotTrace.copiedDirectories.length} directories)`);
    }
}
