import crypto from 'crypto';
import path from 'path';

const SCRIPT_EXTENSION_REGEX = /\.[jt]sx?$/i;

export function normalizeComponentPath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function stripComponentExtension(input: string): string {
  return input.replace(SCRIPT_EXTENSION_REGEX, '');
}

export function relativeComponentPath(baseDir: string, absolutePath: string): string {
  return normalizeComponentPath(path.relative(baseDir, absolutePath));
}

function shortHash(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 8);
}

export function createComponentIdentity(relativePath: string): string {
  const normalized = stripComponentExtension(normalizeComponentPath(relativePath));
  return `${normalized}#${shortHash(normalized)}`;
}

export function createComponentId(
  scope: 'client' | 'server',
  relativePath: string,
  exportName = 'default'
): string {
  return `${scope}:${createComponentIdentity(relativePath)}:${exportName}`;
}

export function createChunkName(relativePath: string): string {
  const normalized = stripComponentExtension(normalizeComponentPath(relativePath));
  const safe = normalized
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return `${safe || 'component'}_${shortHash(normalized)}`;
}
