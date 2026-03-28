import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

export interface ReactClientReferenceManifestEntry {
  id: string | number;
  chunks: Array<string | number>;
  name: string;
}

export type ReactClientReferenceManifest = Record<string, ReactClientReferenceManifestEntry>;

export interface ReactServerConsumerManifestEntry {
  specifier?: string;
  id?: string | number;
  chunks?: Array<string | number>;
  name?: string;
}

export interface ReactServerConsumerManifest {
  moduleLoading?: { prefix: string; crossOrigin: string | null };
  moduleMap?: Record<string, Record<string, ReactServerConsumerManifestEntry>>;
  serverModuleMap?: Record<string, unknown>;
}

function extractExportNames(source: string): string[] {
  const exports = new Set<string>();

  if (/export\s+default\s+/.test(source)) {
    exports.add('default');
  }

  const namedExportRegex =
    /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = namedExportRegex.exec(source)) !== null) {
    exports.add(match[1]);
  }

  const reExportRegex = /export\s+\{([^}]+)\}/g;
  while ((match = reExportRegex.exec(source)) !== null) {
    const names = match[1]
      .split(',')
      .map((entry) =>
        entry
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim()
      )
      .filter(Boolean) as string[];
    for (const name of names) {
      exports.add(name);
    }
  }

  const commonJsExportRegex = /exports\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((match = commonJsExportRegex.exec(source)) !== null) {
    if (match[1] !== '__esModule') {
      exports.add(match[1]);
    }
  }

  if (/module\.exports\s*=/.test(source) || /exports\.default\s*=/.test(source)) {
    exports.add('default');
  }

  return Array.from(exports);
}

function resolveManifestFilePath(specifier: string): string | null {
  const baseSpecifier = specifier.split('#', 1)[0];
  if (!baseSpecifier.startsWith('file://')) {
    return null;
  }

  try {
    return fileURLToPath(baseSpecifier);
  } catch {
    try {
      return decodeURI(
        baseSpecifier
          .replace(/^file:\/\/\//, '')
          .replace(/^file:\/\//, '')
      );
    } catch {
      return null;
    }
  }
}

function addDriveLetterVariants(specifier: string, variants: Set<string>): void {
  variants.add(specifier);

  const match = specifier.match(/^file:\/\/\/([A-Za-z]):/);
  if (!match) {
    return;
  }

  const lowerDrive = match[1].toLowerCase();
  const upperDrive = match[1].toUpperCase();
  variants.add(specifier.replace(/^file:\/\/\/([A-Za-z]):/, `file:///${lowerDrive}:`));
  variants.add(specifier.replace(/^file:\/\/\/([A-Za-z]):/, `file:///${upperDrive}:`));
}

function buildSpecifierVariants(specifier: string): string[] {
  const baseSpecifier = specifier.split('#', 1)[0];
  const variants = new Set<string>();
  addDriveLetterVariants(baseSpecifier, variants);

  if (baseSpecifier.startsWith('file://')) {
    try {
      addDriveLetterVariants(decodeURI(baseSpecifier), variants);
    } catch {
      // ignore decode failures
    }

    try {
      addDriveLetterVariants(pathToFileURL(fileURLToPath(baseSpecifier)).toString(), variants);
    } catch {
      // ignore encode failures
    }
  }

  return Array.from(variants);
}

function createAliasedEntry(
  entry: ReactClientReferenceManifestEntry,
  exportName: string
): ReactClientReferenceManifestEntry {
  if (exportName === '') {
    return {
      ...entry,
      name: '',
    };
  }

  return {
    ...entry,
    name: exportName,
  };
}

export function normalizeReactClientReferenceManifest(
  input: ReactClientReferenceManifest
): ReactClientReferenceManifest {
  const manifest: ReactClientReferenceManifest = { ...input };

  for (const [rawSpecifier, rawEntry] of Object.entries(input || {})) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      continue;
    }

    const entry: ReactClientReferenceManifestEntry = {
      id: rawEntry.id,
      chunks: Array.isArray(rawEntry.chunks) ? rawEntry.chunks : [],
      name: rawEntry.name || '*',
    };

    const sourcePath = resolveManifestFilePath(rawSpecifier);
    const exportNames = new Set<string>();
    if (entry.name && entry.name !== '*') {
      exportNames.add(entry.name);
    }

    if (sourcePath && fs.existsSync(sourcePath)) {
      try {
        const source = fs.readFileSync(sourcePath, 'utf-8');
        for (const exportName of extractExportNames(source)) {
          exportNames.add(exportName);
        }
      } catch {
        // Keep manifest normalization resilient even if a source file disappears mid-build.
      }
    }

    for (const baseSpecifier of buildSpecifierVariants(rawSpecifier)) {
      if (!manifest[baseSpecifier]) {
        manifest[baseSpecifier] = entry;
      }

      const emptyExportKey = `${baseSpecifier}#`;
      if (!manifest[emptyExportKey]) {
        manifest[emptyExportKey] = createAliasedEntry(entry, '');
      }

      const defaultExportKey = `${baseSpecifier}#default`;
      if (!manifest[defaultExportKey]) {
        manifest[defaultExportKey] = createAliasedEntry(entry, 'default');
      }

      for (const exportName of exportNames) {
        const exportKey = `${baseSpecifier}#${exportName}`;
        if (!manifest[exportKey]) {
          manifest[exportKey] = createAliasedEntry(entry, exportName);
        }
      }
    }
  }

  return manifest;
}

export function normalizeReactServerConsumerManifest(
  input: ReactServerConsumerManifest
): ReactServerConsumerManifest {
  if (!input?.moduleMap) {
    return input;
  }

  for (const [moduleKey, rawExportsMap] of Object.entries(input.moduleMap)) {
    const normalizedExportsMap: Record<string, ReactServerConsumerManifestEntry> = {};
    const exportNames = new Set<string>();
    let sourceSpecifier: string | null = null;
    let seedEntry: ReactServerConsumerManifestEntry | null = null;

    for (const [exportName, rawEntry] of Object.entries(rawExportsMap || {})) {
      const entry: ReactServerConsumerManifestEntry = {
        id: rawEntry?.id ?? rawEntry?.specifier ?? moduleKey,
        chunks: Array.isArray(rawEntry?.chunks) ? rawEntry.chunks : [],
        name: rawEntry?.name || exportName,
      };
      normalizedExportsMap[exportName] = entry;
      if (exportName !== '*') {
        exportNames.add(exportName);
      }
      if (entry.name && entry.name !== '*') {
        exportNames.add(entry.name);
      }
      if (!seedEntry) {
        seedEntry = entry;
      }
      if (!sourceSpecifier && typeof entry.id === 'string' && entry.id.startsWith('file://')) {
        sourceSpecifier = entry.id;
      }
      if (!sourceSpecifier && typeof rawEntry?.specifier === 'string' && rawEntry.specifier.startsWith('file://')) {
        sourceSpecifier = rawEntry.specifier;
      }
    }

    const sourcePath = sourceSpecifier ? resolveManifestFilePath(sourceSpecifier) : null;
    if (sourcePath && fs.existsSync(sourcePath)) {
      try {
        const source = fs.readFileSync(sourcePath, 'utf-8');
        for (const exportName of extractExportNames(source)) {
          exportNames.add(exportName);
        }
      } catch {
        // Keep manifest normalization resilient even if the source file changes mid-build.
      }
    }

    if (seedEntry) {
      if (!normalizedExportsMap['*']) {
        normalizedExportsMap['*'] = {
          ...seedEntry,
          name: '*',
        };
      }

      for (const exportName of exportNames) {
        if (!normalizedExportsMap[exportName]) {
          normalizedExportsMap[exportName] = {
            ...seedEntry,
            name: exportName,
          };
        }
      }
    }

    input.moduleMap[moduleKey] = normalizedExportsMap;
  }

  return input;
}
