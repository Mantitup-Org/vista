import fs from 'fs';
import path from 'path';

export function ensureDir(absolutePath: string): void {
  fs.mkdirSync(absolutePath, { recursive: true });
}

const SKIP_COPY_DIRECTORY_NAMES = new Set(['.cache', '.turbo', '.vite', 'coverage']);

export function copyDirectoryRecursive(
  sourceDir: string,
  targetDir: string,
  seen: Set<string> = new Set()
): void {
  if (!fs.existsSync(sourceDir)) return;

  let realSource = sourceDir;
  try {
    realSource = fs.realpathSync(sourceDir);
  } catch {
    return;
  }
  if (seen.has(realSource)) return;
  seen.add(realSource);

  ensureDir(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (SKIP_COPY_DIRECTORY_NAMES.has(entry.name)) continue;

    const from = path.join(sourceDir, entry.name);
    const to = path.join(targetDir, entry.name);

    if (entry.isSymbolicLink()) {
      try {
        const targetStat = fs.statSync(from);
        if (targetStat.isDirectory()) {
          copyDirectoryRecursive(from, to, seen);
        } else if (targetStat.isFile()) {
          ensureDir(path.dirname(to));
          fs.copyFileSync(from, to);
        }
      } catch {
        // dangling symlink
      }
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectoryRecursive(from, to, seen);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

export function copyFileIfPresent(sourceFile: string, targetFile: string): void {
  if (!fs.existsSync(sourceFile)) return;
  ensureDir(path.dirname(targetFile));
  fs.copyFileSync(sourceFile, targetFile);
}

export function writeFileIfAllowed(
  targetFile: string,
  content: string,
  force: boolean
): { written: boolean; skipped: boolean } {
  if (fs.existsSync(targetFile) && !force) {
    return { written: false, skipped: true };
  }
  ensureDir(path.dirname(targetFile));
  fs.writeFileSync(targetFile, content, 'utf8');
  return { written: true, skipped: false };
}

export function readJsonSafe<T>(absolutePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export const STATIC_HOST_ROUTE_RULES = [
  { handle: 'filesystem' as const },
  { src: '^/_vista/static/(.*)$', dest: '/static/$1' },
  { src: '^/(?:rsc|_rsc)/?$', dest: '/static/pages/index.rsc' },
  { src: '^/(?:rsc|_rsc)/(.+)$', dest: '/static/pages/$1.rsc' },
  { src: '^/$', dest: '/static/pages/index.html' },
  { src: '^/(.+)$', dest: '/static/pages/$1.html' },
];

function walkFiles(
  dir: string,
  visitor: (absolutePath: string, relativePath: string) => void,
  prefix = ''
): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolutePath, visitor, relativePath);
    } else if (entry.isFile()) {
      visitor(absolutePath, relativePath);
    }
  }
}

/** Lift `.vista/static/pages/*.html` to pretty CDN paths (`docs/foo/index.html`). */
export function flattenPrerenderedPages(pagesDir: string, targetDir: string): void {
  walkFiles(pagesDir, (absolutePath, relativePath) => {
    const posix = relativePath.replace(/\\/g, '/');
    if (!posix.endsWith('.html') || posix.endsWith('.shell.html')) return;
    const destRel =
      posix === 'index.html' || posix.endsWith('/index.html')
        ? posix
        : posix.replace(/\.html$/, '/index.html');
    const dest = path.join(targetDir, destRel.split('/').join(path.sep));
    ensureDir(path.dirname(dest));
    fs.copyFileSync(absolutePath, dest);
  });
}

/** Serve Flight files at `/rsc/*.rsc` (extension avoids file/directory collisions). */
export function flattenPrerenderedFlight(pagesDir: string, targetDir: string): void {
  walkFiles(pagesDir, (absolutePath, relativePath) => {
    const posix = relativePath.replace(/\\/g, '/');
    if (!posix.endsWith('.rsc')) return;
    const destRel = `rsc/${posix}`;
    const dest = path.join(targetDir, destRel.split('/').join(path.sep));
    ensureDir(path.dirname(dest));
    fs.copyFileSync(absolutePath, dest);
  });
}

function writeStaticRscRedirects(targetDir: string): void {
  const redirectsPath = path.join(targetDir, '_redirects');
  const lines = [
    '/rsc /rsc/index.rsc 200',
    '/rsc/ /rsc/index.rsc 200',
    '/rsc/* /rsc/:splat.rsc 200',
  ];
  let existing = '';
  if (fs.existsSync(redirectsPath)) {
    existing = fs.readFileSync(redirectsPath, 'utf8');
    if (existing && !existing.endsWith('\n')) existing += '\n';
  }
  fs.writeFileSync(redirectsPath, `${lines.join('\n')}\n${existing}`, 'utf8');
}

/** Copy webpack assets to `/_vista/static` and flatten HTML + Flight for file-based CDNs. */
export function prepareStaticCdnOutput(targetDir: string): void {
  const staticDir = path.join(targetDir, 'static');
  copyDirectoryRecursive(staticDir, path.join(targetDir, '_vista', 'static'));
  flattenPrerenderedPages(path.join(staticDir, 'pages'), targetDir);
  flattenPrerenderedFlight(path.join(staticDir, 'pages'), targetDir);
  writeStaticRscRedirects(targetDir);
}

export function copyStaticHostAssets(cwd: string, vistaDir: string, targetDir: string): void {
  copyDirectoryRecursive(path.join(cwd, 'public'), targetDir);
  copyDirectoryRecursive(path.join(vistaDir, 'static'), path.join(targetDir, 'static'));
  copyDirectoryRecursive(path.join(vistaDir, 'static'), path.join(targetDir, '_vista', 'static'));

  const clientCssPath = path.join(vistaDir, 'client.css');
  copyFileIfPresent(clientCssPath, path.join(targetDir, 'client.css'));
  copyFileIfPresent(clientCssPath, path.join(targetDir, 'styles.css'));
}
