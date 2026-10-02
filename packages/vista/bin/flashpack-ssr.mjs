import fs from 'node:fs';
import path from 'node:path';
import { createRequire, register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return '';
  return process.argv[index + 1];
}

const cwd = path.resolve(readArg('--cwd') || process.cwd());
const requestPath = readArg('--path') || '/';
const modulesDir = path.join(cwd, '.flash', 'dev', 'modules');
const shimsDir = path.join(cwd, '.flash', 'dev', 'ssr');
const selfDir = path.dirname(fileURLToPath(import.meta.url));
const vistaPkgRoot = path.resolve(selfDir, '..');

const registered = register(new URL('./flashpack-ssr-loader.mjs', import.meta.url), {
  parentURL: import.meta.url,
  data: { modulesDir, shimsDir },
});
if (registered && typeof registered.then === 'function') {
  await registered;
}

function resolveFrom(roots, request) {
  const errors = [];
  for (const root of roots) {
    try {
      return createRequire(path.join(root, 'package.json'))(request);
    } catch (error) {
      errors.push(`${root}: ${error && error.message ? error.message : error}`);
    }
  }
  throw new Error(`Cannot resolve '${request}' for flashpack SSR\n${errors.join('\n')}`);
}

const react = resolveFrom([cwd, vistaPkgRoot, path.resolve(cwd, '../..'), path.resolve(cwd, '../../..')], 'react');
const reactDomServer = resolveFrom(
  [cwd, vistaPkgRoot, path.resolve(cwd, '../..'), path.resolve(cwd, '../../..')],
  'react-dom/server'
);
const { createElement } = react;
const { renderToReadableStream } = reactDomServer;

function walk(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

function partsOf(pathname) {
  return String(pathname || '/')
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .filter(Boolean);
}

function matchSegments(segments, parts) {
  const params = {};
  let pi = 0;
  let staticCount = 0;
  let dynamicCount = 0;
  for (const seg of segments) {
    if (seg.startsWith('(') && seg.endsWith(')')) continue;
    if (seg.startsWith('[...') && seg.endsWith(']')) {
      params[seg.slice(4, -1)] = parts.slice(pi);
      dynamicCount += 1;
      pi = parts.length;
      continue;
    }
    if (seg.startsWith('[') && seg.endsWith(']')) {
      if (pi >= parts.length) return null;
      params[seg.slice(1, -1)] = parts[pi];
      dynamicCount += 1;
      pi += 1;
      continue;
    }
    if (pi >= parts.length || parts[pi] !== seg) return null;
    staticCount += 1;
    pi += 1;
  }
  if (pi !== parts.length) return null;
  return { params, staticCount, dynamicCount };
}

function layoutApplies(segments, parts) {
  let pi = 0;
  for (const seg of segments || []) {
    if (seg.startsWith('(') && seg.endsWith(')')) continue;
    if (seg.startsWith('[...')) return true;
    if (seg.startsWith('[') && seg.endsWith(']')) {
      if (pi >= parts.length) return false;
      pi += 1;
      continue;
    }
    if (parts[pi] !== seg) return false;
    pi += 1;
  }
  return true;
}

function collectRoutes() {
  const pages = [];
  const layouts = [];
  let rootFile = null;
  let rootLayoutFile = null;

  for (const appRel of ['app', 'src/app']) {
    const dir = path.join(modulesDir, appRel);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const relative = path.relative(dir, file).replaceAll('\\', '/');
      const name = path.basename(relative);
      const segments = relative.split('/').slice(0, -1).filter(Boolean);
      if (!rootFile && name.startsWith('root.') && segments.length === 0) {
        rootFile = file;
      }
      if (!rootLayoutFile && name.startsWith('layout.') && segments.length === 0) {
        rootLayoutFile = file;
      }
      if (name.startsWith('page.') || name.startsWith('index.')) {
        pages.push({ file, segments });
      } else if (name.startsWith('layout.') && segments.length > 0) {
        // Root layout is used as the document shell, not a nested layout.
        layouts.push({ file, segments });
      }
    }
  }

  return {
    rootFile: rootFile || rootLayoutFile,
    pages,
    layouts,
  };
}

function pickPage(pages, parts) {
  let best = null;
  for (const page of pages) {
    const matched = matchSegments(page.segments || [], parts);
    if (!matched) continue;
    const candidate = { page, ...matched };
    if (
      !best ||
      candidate.staticCount > best.staticCount ||
      (candidate.staticCount === best.staticCount && candidate.dynamicCount < best.dynamicCount)
    ) {
      best = candidate;
    }
  }
  return best;
}

async function renderNode(Component, props) {
  if (
    typeof Component === 'function' &&
    Component.constructor &&
    Component.constructor.name === 'AsyncFunction'
  ) {
    return await Component(props);
  }
  return createElement(Component, props);
}

const table = collectRoutes();
if (!table.rootFile) {
  throw new Error('flashpack ssr: app/root or app/layout was not compiled');
}

const pathname = requestPath.replace(/\/$/, '') || '/';
const parts = partsOf(pathname);
const match = pickPage(table.pages, parts);
if (!match) {
  throw new Error(`flashpack ssr: no page module for ${pathname}`);
}

const rootMod = await import(pathToFileURL(table.rootFile).href);
const pageMod = await import(pathToFileURL(match.page.file).href);
const Root = rootMod.default;
const Page = pageMod.default;

let tree = await renderNode(Page, { params: match.params });
const nested = table.layouts
  .filter((layout) => layoutApplies(layout.segments, parts))
  .sort((a, b) => (a.segments || []).length - (b.segments || []).length);
for (const layout of nested) {
  const layoutMod = await import(pathToFileURL(layout.file).href);
  if (typeof layoutMod.default !== 'function') continue;
  tree = await renderNode(layoutMod.default, { params: match.params, children: tree });
}
tree = createElement(Root, { children: tree });

const stream = await renderToReadableStream(tree);
await stream.allReady;
process.stdout.write(await new Response(stream).text());
