import fs from 'fs';
import path from 'path';

export interface ClassifiedSegment {
  kind: string;
  segment: string;
}

interface RustBindings {
  classifyAppSegmentInfo?(folder: string): ClassifiedSegment;
  routePattern?(folders: string[]): string;
  encodeVistaErrorCode?(code: string): string;
  findVistaErrorCodes?(source: string): string[];
  tasklessSteps?(enabled: boolean): string[];
}

let native: RustBindings | null | undefined;

function loadNative(): RustBindings | null {
  if (native !== undefined) return native;
  const candidates = [
    path.resolve(__dirname, '../../../crates/vista-napi'),
    path.resolve(__dirname, '../../../../crates/vista-napi'),
    path.resolve(process.cwd(), 'crates/vista-napi'),
    path.resolve(process.cwd(), '../crates/vista-napi'),
  ];
  for (const candidate of candidates) {
    try {
      native = require(candidate) as RustBindings;
      return native;
    } catch {
      // Try the next location. The TypeScript fallback stays correct either way.
    }
  }
  native = null;
  return null;
}

export function nativeBindingsLoaded(): boolean {
  return loadNative() !== null;
}

export function classifyAppSegment(folder: string): ClassifiedSegment {
  const bound = loadNative();
  if (bound?.classifyAppSegmentInfo) return bound.classifyAppSegmentInfo(folder);
  return classifyAppSegmentFallback(folder);
}

export function routePattern(folders: string[]): string {
  const bound = loadNative();
  if (bound?.routePattern) return bound.routePattern(folders);
  return routePatternFallback(folders);
}

function isValidCode(code: string): boolean {
  return code.length > 0 && /^[A-Z0-9_]+$/.test(code);
}

export function encodeVistaErrorCode(code: string): string {
  const bound = loadNative();
  if (bound?.encodeVistaErrorCode) return bound.encodeVistaErrorCode(code);
  if (code.startsWith('VISTA_') && isValidCode(code.slice('VISTA_'.length))) return code;
  return `VISTA_${code}`;
}

export function findVistaErrorCodes(source: string): string[] {
  const bound = loadNative();
  if (bound?.findVistaErrorCodes) return bound.findVistaErrorCodes(source);
  const found: string[] = [];
  const pattern = /VISTA_([A-Z0-9_]+)/g;
  for (const match of source.matchAll(pattern)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

export function tasklessSteps(enabled: boolean): string[] {
  const bound = loadNative();
  if (bound?.tasklessSteps) return bound.tasklessSteps(enabled);
  return enabled ? ['scan', 'reuse-state', 'serve'] : ['scan', 'queue-work', 'serve'];
}

export function classifyAppSegmentFallback(folder: string): ClassifiedSegment {
  if (!folder) return { kind: 'static', segment: '' };
  if (
    folder.startsWith('(...)') ||
    folder.startsWith('(..)(..)') ||
    folder.startsWith('(..)') ||
    folder.startsWith('(.)')
  ) {
    return { kind: 'interception', segment: folder };
  }
  if (folder.startsWith('(') && folder.endsWith(')') && folder.length >= 2) {
    return { kind: 'group', segment: folder.slice(1, -1) };
  }
  if (folder.startsWith('@') && folder.length > 1) {
    return { kind: 'parallel', segment: folder.slice(1) };
  }
  if (folder.startsWith('[[...') && folder.endsWith(']]') && folder.length > '[[...]]'.length) {
    return { kind: 'optional-catch-all', segment: folder.slice(5, -2) };
  }
  if (folder.startsWith('[...') && folder.endsWith(']') && folder.length > '[...]'.length) {
    return { kind: 'catch-all', segment: folder.slice(4, -1) };
  }
  if (folder.startsWith('[') && folder.endsWith(']') && folder.length >= 2) {
    return { kind: 'dynamic', segment: folder.slice(1, -1) };
  }
  return { kind: 'static', segment: folder };
}

export function routePatternFallback(folders: string[]): string {
  const parts: string[] = [];
  for (const folder of folders) {
    const classified = classifyAppSegmentFallback(folder);
    if (classified.kind === 'group' || classified.kind === 'parallel' || classified.kind === 'interception') {
      continue;
    }
    if (classified.kind === 'dynamic') parts.push(`:${classified.segment}`);
    else if (classified.kind === 'catch-all') parts.push(`:${classified.segment}*`);
    else if (classified.kind === 'optional-catch-all') parts.push(`:${classified.segment}*?`);
    else parts.push(classified.segment);
  }
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

export function readBoundPipeline(cwd: string = process.cwd()): Record<string, unknown> | null {
  const file = path.join(cwd, '.flash', 'pipeline', 'bound.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}
