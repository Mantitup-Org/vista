import fs from 'fs';
import path from 'path';
import { BUILD_DIR } from '../constants';

type ArtifactMode = 'legacy' | 'rsc';

const BASE_REQUIRED_FILES = [
  'BUILD_ID',
  'artifact-manifest.json',
  'build-manifest.json',
  'routes-manifest.json',
  'app-path-routes-manifest.json',
  'prerender-manifest.json',
  'required-server-files.json',
  'react-client-manifest.json',
  'react-server-manifest.json',
];

const RSC_REQUIRED_FILES = [
  ...BASE_REQUIRED_FILES,
  path.join('server', 'server-manifest.json'),
  path.join('server', 'runtime-manifest.json'),
  path.join('server', 'file-trace.json'),
  path.join('standalone', 'server.js'),
];

const LEGACY_REQUIRED_FILES = [...BASE_REQUIRED_FILES, 'client.js'];

function readJsonSafe<T>(absolutePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function validateVistaArtifacts(cwd: string, mode: ArtifactMode): string[] {
  const vistaDir = path.join(cwd, BUILD_DIR);
  const missing: string[] = [];
  const requiredFiles = mode === 'rsc' ? RSC_REQUIRED_FILES : LEGACY_REQUIRED_FILES;

  if (!fs.existsSync(vistaDir)) {
    return [`${BUILD_DIR} directory is missing`];
  }

  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(vistaDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      missing.push(relativePath);
    }
  }

  const artifactPath = path.join(vistaDir, 'artifact-manifest.json');
  const artifactManifest = readJsonSafe<{ schemaVersion?: number }>(artifactPath);
  if (fs.existsSync(artifactPath) && (!artifactManifest || artifactManifest.schemaVersion !== 1)) {
    missing.push('artifact-manifest.json (invalid schemaVersion)');
  }

  const runtimeManifestPath = path.join(vistaDir, 'server', 'runtime-manifest.json');
  const runtimeManifest = readJsonSafe<{ schemaVersion?: number }>(runtimeManifestPath);
  if (
    mode === 'rsc' &&
    fs.existsSync(runtimeManifestPath) &&
    (!runtimeManifest || runtimeManifest.schemaVersion !== 1)
  ) {
    missing.push('server/runtime-manifest.json (invalid schemaVersion)');
  }

  const fileTracePath = path.join(vistaDir, 'server', 'file-trace.json');
  const fileTrace = readJsonSafe<{ schemaVersion?: number; copiedFiles?: unknown[] }>(fileTracePath);
  if (
    mode === 'rsc' &&
    fs.existsSync(fileTracePath) &&
    (!fileTrace || fileTrace.schemaVersion !== 1 || !Array.isArray(fileTrace.copiedFiles))
  ) {
    missing.push('server/file-trace.json (invalid schemaVersion)');
  }

  return missing;
}

export function assertVistaArtifacts(cwd: string, mode: ArtifactMode): void {
  const missing = validateVistaArtifacts(cwd, mode);
  if (missing.length === 0) return;

  const missingList = missing.map((entry) => `- ${entry}`).join('\n');
  throw new Error(
    `[vista:server] Missing or invalid ${BUILD_DIR} artifacts for ${mode} mode.\n${missingList}\nRun "vista build${mode === 'rsc' ? ' --rsc' : ''}" first.`
  );
}
