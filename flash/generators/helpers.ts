import type { NodePlopAPI } from 'node-plop';

export function toFileName(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
}

export function init(plop: NodePlopAPI): void {
  plop.setHelper('toFileName', toFileName);
}
