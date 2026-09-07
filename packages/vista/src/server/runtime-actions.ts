import { pathToFileURL } from 'url';
import path from 'path';

type RegisterServerReferenceFn = (
  reference: Function,
  id: string,
  exportName: string | null
) => Function | void;

const SERVER_REFERENCE_TYPE = Symbol.for('react.server.reference');
const registeredReferences = new Map<string, Function>();

let injectedRegisterServerReference: RegisterServerReferenceFn | null = null;
let cachedRegisterServerReference: RegisterServerReferenceFn | null | undefined;

function getRegisterServerReference(): RegisterServerReferenceFn | null {
  if (injectedRegisterServerReference) {
    return injectedRegisterServerReference;
  }

  if (cachedRegisterServerReference !== undefined) {
    return cachedRegisterServerReference;
  }

  try {
    const runtime = require('react-server-dom-webpack/server.node') as {
      registerServerReference?: RegisterServerReferenceFn;
    };
    if (typeof runtime.registerServerReference === 'function') {
      cachedRegisterServerReference = runtime.registerServerReference;
      return cachedRegisterServerReference;
    }
  } catch {
    // Requiring the Flight server entry can fail when `--conditions react-server`
    // is not active. Manual $$typeof stamping still lets functions serialize.
  }

  // Cache the negative result so the require() is attempted only once per process.
  cachedRegisterServerReference = null;
  return null;
}

function normalizeExportName(exportName?: string | null): string {
  const value = String(exportName || 'default').trim();
  return value || 'default';
}

function normalizeHint(value: string): string {
  return (
    String(value || 'action')
      .trim()
      .replace(/[^a-zA-Z0-9_$]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'action'
  );
}

function createStableFileUrl(filePath: string): string {
  const href = pathToFileURL(path.resolve(filePath)).href;
  return href.replace(/^file:\/\/\/([A-Z]):/, (_match, driveLetter: string) => {
    return `file:///${driveLetter.toLowerCase()}:`;
  });
}

function stampServerReference<T extends Function>(reference: T, id: string): T {
  if (typeof reference !== 'function') {
    return reference;
  }

  try {
    Object.defineProperties(reference, {
      $$typeof: { value: SERVER_REFERENCE_TYPE },
      $$id: { value: id, configurable: true },
      $$bound: { value: null, configurable: true },
    });
  } catch {
    try {
      (reference as any).$$typeof = SERVER_REFERENCE_TYPE;
      (reference as any).$$id = id;
      (reference as any).$$bound = null;
    } catch {
      // Ignore frozen functions; the registrar Map still keeps a callable.
    }
  }

  return reference;
}

export function setServerReferenceRegistrar(fn: RegisterServerReferenceFn | null): void {
  injectedRegisterServerReference = fn;
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
  exportName: string | null = null
): T {
  if (typeof reference !== 'function') {
    return reference;
  }

  let tagged: Function = reference;
  const registerServerReference = getRegisterServerReference();
  if (registerServerReference) {
    try {
      const registered = registerServerReference(reference, id, exportName);
      if (typeof registered === 'function') {
        tagged = registered;
      }
    } catch {
      // Fall through to manual stamping so Client Components can still receive the action.
    }
  }

  stampServerReference(tagged, id);
  registeredReferences.set(id, tagged);
  return tagged as T;
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

    const registered = registerInlineServerReference(
      exportedValue,
      createExportServerReferenceId(filePath, exportName),
      null
    );
    if (registered !== exportedValue) {
      record[exportName] = registered;
    }
  }

  return moduleExports;
}

export function resolveRegisteredServerReference(id: string): Function | undefined {
  return registeredReferences.get(id);
}

export function isServerReference(value: unknown): value is Function {
  return typeof value === 'function' && (value as any).$$typeof === SERVER_REFERENCE_TYPE;
}
