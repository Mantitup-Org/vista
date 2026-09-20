import fs from 'fs';
import path from 'path';
import { BUILD_DIR } from '../constants';

const BOOTSTRAP_CHUNK_RE =
  /^(webpack|framework|vendor|main|runtime)(?:-[a-z0-9]+)?\.js$/i;

const BOOTSTRAP_PRIORITY = ['webpack', 'framework', 'vendor', 'runtime', 'main'];

export function isBootstrapChunkFile(filename: string): boolean {
  const base = filename.split(/[/\\]/).pop() || filename;
  return BOOTSTRAP_CHUNK_RE.test(base);
}

function bootstrapRank(filename: string): number {
  const base = (filename.split(/[/\\]/).pop() || filename).replace(
    /(?:-[a-z0-9]+)?\.js$/i,
    ''
  );
  const index = BOOTSTRAP_PRIORITY.indexOf(base.toLowerCase());
  return index === -1 ? BOOTSTRAP_PRIORITY.length : index;
}

export function sortHydrationChunkFiles(files: string[]): string[] {
  return [...files].sort((a, b) => {
    const rankDelta = bootstrapRank(a) - bootstrapRank(b);
    if (rankDelta !== 0) return rankDelta;
    return a.localeCompare(b);
  });
}

/**
 * Script tags that must be in the HTML document. Async `clientN-*.js`
 * chunks are loaded by the webpack runtime, matching Next.js.
 */
export function listHydrationChunkFiles(cwd: string, isDev = false): string[] {
  const chunksDir = path.join(cwd, BUILD_DIR, 'static', 'chunks');
  if (!fs.existsSync(chunksDir)) return [];

  const files = fs
    .readdirSync(chunksDir)
    .filter(
      (name) =>
        name.endsWith('.js') &&
        !name.endsWith('.map') &&
        !name.includes('.hot-update.') &&
        isBootstrapChunkFile(name)
    );

  const normalizedFiles = isDev
    ? files.filter((name) => !/-[0-9a-f]{8,}\.js$/i.test(name))
    : files;

  return sortHydrationChunkFiles(normalizedFiles);
}
