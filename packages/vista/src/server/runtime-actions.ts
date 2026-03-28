import { pathToFileURL } from 'url';
import path from 'path';

type RegisterServerReferenceFn = (reference: Function, id: string, exportName: string) => void;

const registeredReferences = new Map<string, Function>();

let cachedRegisterServerReference: RegisterServerReferenceFn | null | undefined;

function getRegisterServerReference(): RegisterServerReferenceFn | null {
  if (cachedRegisterServerReference !== undefined) {
    return cachedRegisterServerReference;
  }

  try {
    const runtime = require('react-server-dom-webpack/server.node') as {
      registerServerReference?: RegisterServerReferenceFn;
    };
    cachedRegisterServerReference =
      typeof runtime.registerServerReference === 'function'
        ? runtime.registerServerReference
        : null;
  } catch {
    cachedRegisterServerReference = null;
  }

  return cachedRegisterServerReference;
}

function normalizeExportName(exportName?: string): string {
  const value = String(exportName || 'default').trim();
  return value || 'default';
}

function normalizeHint(value: string): string {
  return String(value || 'action')
    .trim()
    .replace(/[^a-zA-Z0-9_$]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'action';
}

function createStableFileUrl(filePath: string): string {
  const href = pathToFileURL(path.resolve(filePath)).href;
  return href.replace(/^file:\/\/\/([A-Z]):/, (_match, driveLetter: string) => {
    return `file:///${driveLetter.toLowerCase()}:`;
  });
}

export function createExportServerReferenceId(filePath: string, exportName = 'default'): string {
  return `${createStableFileUrl(filePath)}#${normalizeExportName(exportName)}`;
}

export function createInlineServerActionId(
  filePath: string,
  ordinal: number,
  hint = 'action'
): string {
  return `${createStableFileUrl(filePath)}#inline_${ordinal}_${normalizeHint(hint)}`;
}

export function registerInlineServerReference<T extends Function>(
  reference: T,
  id: string,
  exportName = 'default'
): T {
  if (typeof reference !== 'function') {
    return reference;
  }

  const normalizedExportName = normalizeExportName(exportName);
  const registerServerReference = getRegisterServerReference();
  if (registerServerReference) {
    registerServerReference(reference, id, normalizedExportName);
  }

  registeredReferences.set(id, reference);
  return reference;
}

export function registerServerActionModule(
  moduleExports: unknown,
  filePath: string
): unknown {
  if (!moduleExports || typeof moduleExports !== 'object') {
    return moduleExports;
  }

  const record = moduleExports as Record<string, unknown>;
  for (const [exportName, exportedValue] of Object.entries(record)) {
    if (typeof exportedValue !== 'function') {
      continue;
    }

    registerInlineServerReference(
      exportedValue,
      createExportServerReferenceId(filePath, exportName),
      exportName
    );
  }

  return moduleExports;
}

export function resolveRegisteredServerReference(id: string): Function | undefined {
  return registeredReferences.get(id);
}
