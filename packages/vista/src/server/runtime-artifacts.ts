import fs from 'fs';
import path from 'path';
import { BUILD_DIR } from '../constants';

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

function readRuntimeArtifactsManifest(projectRoot: string): RuntimeArtifactsManifest | null {
  const manifestPath = path.join(projectRoot, BUILD_DIR, 'server', 'runtime-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as RuntimeArtifactsManifest;
  } catch {
    return null;
  }
}

export function resolveRuntimeProjectRoot(
  projectRoot: string,
  explicitRuntimeRoot?: string
): string {
  if (explicitRuntimeRoot && explicitRuntimeRoot.trim().length > 0) {
    return path.resolve(explicitRuntimeRoot);
  }

  const envRuntimeRoot = process.env.VISTA_RUNTIME_ROOT;
  if (envRuntimeRoot && envRuntimeRoot.trim().length > 0) {
    return path.resolve(envRuntimeRoot);
  }

  const manifest = readRuntimeArtifactsManifest(projectRoot);
  if (manifest?.runtimeRootRelative) {
    return path.resolve(projectRoot, manifest.runtimeRootRelative);
  }

  return projectRoot;
}
