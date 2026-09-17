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

export const SERVER_REFERENCE_TAG = Symbol.for('react.server.reference');

export function setRegisterServerReference(fn: RegisterServerReferenceFn | null): void {
  cachedRegisterServerReference = fn;
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
    try {
      registerServerReference(reference, id, normalizedExportName);
    } catch {
      // Fallback manual registration below
    }
  }

  // Ensure React Server Components serializer recognizes the reference as a valid Server Reference
  const targetId = normalizedExportName === 'default' ? id : `${id}#${normalizedExportName}`;
  const funcObj = reference as any;
  if (funcObj.$$typeof !== SERVER_REFERENCE_TAG) {
    try {
      Object.defineProperties(reference, {
        $$typeof: { value: SERVER_REFERENCE_TAG, configurable: true, enumerable: false },
        $$id: { value: targetId, configurable: true, enumerable: true },
        $$bound: { value: funcObj.$$bound ?? null, configurable: true, enumerable: false },
        $$location: {
          value: funcObj.$$location ?? Error('react-server-action-frame'),
          configurable: true,
          enumerable: false,
        },
      });
    } catch {
      funcObj.$$typeof = SERVER_REFERENCE_TAG;
      funcObj.$$id = targetId;
      funcObj.$$bound = funcObj.$$bound ?? null;
    }
  }

  registeredReferences.set(id, reference);
  if (targetId !== id) {
    registeredReferences.set(targetId, reference);
  }
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
