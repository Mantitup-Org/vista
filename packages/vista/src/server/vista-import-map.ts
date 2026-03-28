import fs from 'fs';
import path from 'path';

interface NativeVistaImportResolution {
  normalizedRequest: string;
  subpath: string;
  candidateBases: string[];
  resolvedPath: string | null;
}

interface NativeVistaModule {
  resolveVistaSourceImport(
    request: string,
    packageRoot: string
  ): NativeVistaImportResolution | null;
}

let nativeModule: NativeVistaModule | null = null;
let nativeLoadAttempted = false;

function loadNativeModule(): NativeVistaModule | null {
  if (nativeLoadAttempted) {
    return nativeModule;
  }

  nativeLoadAttempted = true;
  const possiblePaths = [
    path.resolve(__dirname, '../../../../crates/vista-napi'),
    path.resolve(__dirname, '../../../crates/vista-napi'),
    path.resolve(process.cwd(), '../crates/vista-napi'),
    '@aspect-build/vista-napi',
  ];

  for (const modulePath of possiblePaths) {
    try {
      nativeModule = require(modulePath) as NativeVistaModule;
      return nativeModule;
    } catch {
      // continue
    }
  }

  return null;
}

function resolveExistingModuleBase(candidateBase: string): string | null {
  for (const extension of ['.js', '.ts', '.tsx', '.jsx']) {
    const absolutePath = `${candidateBase}${extension}`;
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  for (const extension of ['.js', '.ts', '.tsx', '.jsx']) {
    const indexPath = path.join(candidateBase, `index${extension}`);
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

function normalizeVistaRequest(request: string): string | null {
  const normalizedRequest =
    request === '@vistagenic/vista'
      ? 'vista'
      : request.startsWith('@vistagenic/vista/')
        ? `vista/${request.slice('@vistagenic/vista/'.length)}`
        : request;

  if (normalizedRequest !== 'vista' && !normalizedRequest.startsWith('vista/')) {
    return null;
  }

  return normalizedRequest;
}

function resolveSourceCandidates(packageRoot: string, subpath: string): string[] {
  if (subpath === '') {
    return [path.join(packageRoot, 'react-server'), path.join(packageRoot, 'index')];
  }

  const sourceMap: Record<string, string[]> = {
    link: [path.join(packageRoot, 'client', 'link')],
    image: [path.join(packageRoot, 'image', 'react-server'), path.join(packageRoot, 'image', 'index')],
    router: [path.join(packageRoot, 'client', 'router')],
    navigation: [path.join(packageRoot, 'client', 'navigation')],
    dynamic: [path.join(packageRoot, 'client', 'dynamic')],
    script: [path.join(packageRoot, 'client', 'script')],
    font: [path.join(packageRoot, 'font', 'index')],
    'font/google': [path.join(packageRoot, 'font', 'google')],
    'font/local': [path.join(packageRoot, 'font', 'local')],
    head: [path.join(packageRoot, 'client', 'head.react-server'), path.join(packageRoot, 'client', 'head')],
    config: [path.join(packageRoot, 'config')],
    stack: [path.join(packageRoot, 'stack', 'index')],
    'stack/client': [path.join(packageRoot, 'stack', 'client', 'index')],
    'client/rsc-router': [path.join(packageRoot, 'client', 'rsc-router')],
    'client/server-actions': [path.join(packageRoot, 'client', 'server-actions')],
    server: [path.join(packageRoot, 'server', 'index')],
    'server/runtime-actions': [path.join(packageRoot, 'server', 'runtime-actions')],
    cache: [path.join(packageRoot, 'server', 'cache')],
  };

  if (sourceMap[subpath]) {
    return sourceMap[subpath];
  }

  if (subpath.startsWith('server/')) {
    return [path.join(packageRoot, 'server', subpath.slice('server/'.length))];
  }

  if (subpath.startsWith('client/')) {
    return [path.join(packageRoot, 'client', subpath.slice('client/'.length))];
  }

  return [path.join(packageRoot, subpath)];
}

export function resolveVistaSourceRequest(request: string, packageRoot: string): string | null {
  const native = loadNativeModule();
  if (native?.resolveVistaSourceImport) {
    try {
      const nativeResolution = native.resolveVistaSourceImport(request, packageRoot);
      if (nativeResolution?.resolvedPath) {
        return nativeResolution.resolvedPath;
      }
      if (nativeResolution) {
        return null;
      }
    } catch {
      // fall through to JS fallback
    }
  }

  const normalizedRequest = normalizeVistaRequest(request);
  if (!normalizedRequest) {
    return null;
  }

  const subpath = normalizedRequest === 'vista' ? '' : normalizedRequest.slice('vista/'.length);
  const candidateBases = resolveSourceCandidates(packageRoot, subpath);

  for (const candidateBase of candidateBases) {
    const resolved = resolveExistingModuleBase(candidateBase);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}
