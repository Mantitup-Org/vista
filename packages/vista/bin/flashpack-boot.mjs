import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const cwd = path.resolve(process.argv[2] || '');
const requestPath = process.argv[3] || '/';
const outfile = path.resolve(process.argv[4] || '');
const generation = process.argv[5] || '1';

function loadEsbuild() {
  const bases = [cwd, path.resolve(cwd, '../..'), path.resolve(cwd, '../../..')];
  for (const base of bases) {
    try {
      return createRequire(path.join(base, 'package.json'))('esbuild');
    } catch {
      // try the next root
    }
  }
  const pnpm = path.resolve(cwd, '../../node_modules/.pnpm');
  if (!fs.existsSync(pnpm)) throw new Error('esbuild is not installed');
  const versions = fs.readdirSync(pnpm).filter((name) => name.startsWith('esbuild@')).sort();
  const version = versions.at(-1);
  if (!version) throw new Error('esbuild is not installed');
  return createRequire(path.join(pnpm, version, 'node_modules', 'esbuild', 'package.json'))('esbuild');
}

function walk(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

function moduleUrl(appRel, relative) {
  return `/_flashpack/modules/${appRel}/${relative.replaceAll('\\', '/')}?v=${generation}`;
}

function partsOf(pathname) {
  return String(pathname || '/').split('?')[0].split('#')[0].split('/').filter(Boolean);
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

function collect() {
  const modulesDir = path.join(cwd, '.flash', 'dev', 'modules');
  const pages = [];
  const layouts = [];
  let root = null;
  for (const appRel of ['app', 'src/app']) {
    const dir = path.join(modulesDir, appRel);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const relative = path.relative(dir, file).replaceAll('\\', '/');
      const name = path.basename(relative);
      const segments = relative.split('/').slice(0, -1);
      const url = moduleUrl(appRel, relative);
      if (!root && name.startsWith('root.') && segments.length === 0) root = url.split('?')[0];
      if (name.startsWith('page.') || name.startsWith('index.')) pages.push({ module: url.split('?')[0], segments });
      else if (name.startsWith('layout.')) layouts.push({ module: url.split('?')[0], segments });
    }
  }
  return { root: root || '/_flashpack/modules/app/root.tsx.js', pages, layouts };
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

const table = collect();
const parts = partsOf(requestPath);
let best = null;
for (const page of table.pages) {
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
const layouts = (table.layouts || [])
  .filter((layout) => layoutApplies(layout.segments, parts))
  .sort((a, b) => (a.segments || []).length - (b.segments || []).length);

const imports = [
  `import { hydrateRoot, createRoot } from "/_flashpack/mod/react-dom/client";`,
  `import * as React from "/_flashpack/mod/react";`,
  `import * as ReactDOM from "/_flashpack/mod/react-dom";`,
  `import * as ReactDOMClient from "/_flashpack/mod/react-dom/client";`,
  `import { jsx } from "/_flashpack/mod/react/jsx-runtime";`,
  `import * as JsxRuntime from "/_flashpack/mod/react/jsx-runtime";`,
  `import * as JsxDevRuntime from "/_flashpack/mod/react/jsx-dev-runtime";`,
  `import Root from ${JSON.stringify(table.root)};`,
];
if (best) imports.push(`import Page from ${JSON.stringify(best.page.module)};`);
layouts.forEach((layout, index) => {
  imports.push(`import Layout${index} from ${JSON.stringify(layout.module)};`);
});

const params = JSON.stringify(best ? best.params : {});
const layoutWrap = layouts
  .map((_, index) => `node = jsx(Layout${index}, { params, children: node });`)
  .join('\n');

const source = `${imports.join('\n')}
// Claim the soft-HMR slot immediately so the status poll never hard-reloads
// while this boot script is still hydrating.
window.__VISTA_SOFT_HMR__ = Object.assign(async function pendingSoftHmr() {
  throw new Error("flashpack soft HMR still booting");
}, { __pending: true });
const params = ${params};
const mount = document.getElementById("root");
const target = mount || document;
if (target.querySelectorAll) {
  target.querySelectorAll("[data-cursor-ref]").forEach((node) => node.removeAttribute("data-cursor-ref"));
}
let node = ${best ? 'jsx(Page, { params })' : 'jsx("p", { children: "This page could not be found." })'};
${layoutWrap}
const tree = jsx(Root, { children: node });
window.__VISTA_REACT__ = React;
window.__VISTA_REACT_DOM__ = ReactDOM;
window.__VISTA_REACT_DOM_CLIENT__ = ReactDOMClient;
window.__VISTA_JSX__ = JsxRuntime;
window.__VISTA_JSX_DEV__ = JsxDevRuntime;
let reactRoot;
try {
  if (mount) {
    if (mount.childNodes.length > 0) reactRoot = hydrateRoot(mount, tree);
    else {
      reactRoot = createRoot(mount);
      reactRoot.render(tree);
    }
  } else {
    reactRoot = hydrateRoot(document, tree);
  }
} catch (error) {
  console.error(error);
  reactRoot = createRoot(mount || document.body);
  reactRoot.render(tree);
}
function reveal() {
  document.documentElement.setAttribute("data-vista-ready", "");
  // After first paint, drop BOOT_HOLD entirely. Soft HMR re-renders <html> and
  // would otherwise clear data-vista-ready and hide the body again.
  try {
    const hold = document.getElementById("__vista-boot-hold");
    if (hold) hold.remove();
    document.querySelectorAll("style").forEach((node) => {
      const text = node.textContent || "";
      if (text.includes("data-vista-ready") && text.includes("visibility:hidden")) node.remove();
    });
  } catch (_) {}
}
reveal();

let hmrGeneration = ${JSON.stringify(generation)};
let routes = ${JSON.stringify({ root: table.root, pages: table.pages, layouts: table.layouts })};
function versioned(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url, location.origin);
    parsed.searchParams.set("v", String(hmrGeneration));
    return parsed.pathname + parsed.search;
  } catch {
    if (url.includes("?v=") || url.includes("&v=")) {
      return url.replace(/([?&])v=[^&#]*/, "$1v=" + hmrGeneration);
    }
    return url + (url.includes("?") ? "&" : "?") + "v=" + hmrGeneration;
  }
}
function bustStylesheet(nextGeneration) {
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"][href*="/_flashpack/app.css"]'));
  for (const link of links) {
    const parsed = new URL(link.href, location.href);
    parsed.searchParams.set("v", String(nextGeneration));
    const nextHref = parsed.pathname + parsed.search;
    if ((link.getAttribute("href") || "").includes("v=" + nextGeneration)) continue;
    const next = link.cloneNode(false);
    next.setAttribute("href", nextHref);
    next.onload = () => { try { link.remove(); } catch (_) {} };
    next.onerror = () => { try { next.remove(); } catch (_) {} };
    if (link.parentNode) link.parentNode.insertBefore(next, link.nextSibling);
  }
}
function exportDefault(mod) {
  if (!mod) return null;
  if (mod.default != null) return mod.default;
  if (typeof mod === "function") return mod;
  return null;
}
async function softHmr(nextGeneration) {
  // In-place refresh: keep document + React root; no BOOT_HOLD / location.reload.
  hmrGeneration = String(nextGeneration);
  try {
    const fresh = await fetch("/_flashpack/routes").then((res) => res.json());
    if (fresh && fresh.root) routes = fresh;
  } catch (_) {}
  bustStylesheet(hmrGeneration);
  try {
    await show(location.pathname);
  } finally {
    reveal();
  }
  try {
    const indicator = window.__VISTA_DEVTOOLS_INDICATOR__;
    if (indicator && typeof indicator.pulse === "function") indicator.pulse("hmr", 420);
  } catch (_) {}
}
// Expose immediately so the status poll never falls back to location.reload
// before boot finishes wiring the real handler.
window.__VISTA_SOFT_HMR__ = softHmr;
window.__VISTA_SOFT_HMR__.__pending = false;
function partsOf(pathname) {
  return String(pathname || "/").split("?")[0].split("#")[0].split("/").filter(Boolean);
}
function matchSegments(segments, parts) {
  const params = {};
  let pi = 0;
  let staticCount = 0;
  let dynamicCount = 0;
  for (const seg of segments || []) {
    if (seg.startsWith("(") && seg.endsWith(")")) continue;
    if (seg.startsWith("[...") && seg.endsWith("]")) {
      params[seg.slice(4, -1)] = parts.slice(pi);
      dynamicCount += 1;
      pi = parts.length;
      continue;
    }
    if (seg.startsWith("[") && seg.endsWith("]")) {
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
function pickPage(pages, parts) {
  let best = null;
  for (const page of pages || []) {
    const matched = matchSegments(page.segments || [], parts);
    if (!matched) continue;
    const candidate = { page, ...matched };
    if (!best || candidate.staticCount > best.staticCount || (candidate.staticCount === best.staticCount && candidate.dynamicCount < best.dynamicCount)) best = candidate;
  }
  return best;
}
function layoutApplies(segments, parts) {
  let pi = 0;
  for (const seg of segments || []) {
    if (seg.startsWith("(") && seg.endsWith(")")) continue;
    if (seg.startsWith("[...")) return true;
    if (seg.startsWith("[") && seg.endsWith("]")) {
      if (pi >= parts.length) return false;
      pi += 1;
      continue;
    }
    if (parts[pi] !== seg) return false;
    pi += 1;
  }
  return true;
}
async function renderNode(Component, props) {
  if (typeof Component === "function" && Component.constructor && Component.constructor.name === "AsyncFunction") return await Component(props);
  return jsx(Component, props);
}
async function show(pathname) {
  const parts = partsOf(pathname);
  const match = pickPage(routes.pages, parts);
  const RootComponent = exportDefault(await import(versioned(routes.root)));
  if (typeof RootComponent !== "function") {
    throw new Error("flashpack soft HMR: root module has no default export");
  }
  let tree;
  if (!match) {
    tree = jsx(RootComponent, { children: jsx("p", { children: "This page could not be found." }) });
  } else {
    const PageComponent = exportDefault(await import(versioned(match.page.module)));
    if (typeof PageComponent !== "function") {
      throw new Error("flashpack soft HMR: page module has no default export");
    }
    let next = await renderNode(PageComponent, { params: match.params });
    const nested = (routes.layouts || []).filter((layout) => layoutApplies(layout.segments, parts)).sort((a, b) => (a.segments || []).length - (b.segments || []).length);
    for (const layout of nested) {
      const LayoutComponent = exportDefault(await import(versioned(layout.module)));
      if (typeof LayoutComponent !== "function") continue;
      next = await renderNode(LayoutComponent, { params: match.params, children: next });
    }
    tree = jsx(RootComponent, { children: next });
  }
  if (!reactRoot) {
    const el = document.getElementById("root");
    reactRoot = el ? createRoot(el) : createRoot(document.body);
  }
  ReactDOM.flushSync(() => {
    reactRoot.render(tree);
  });
  reveal();
}
let navQueue = Promise.resolve();
function navigate(href, options) {
  const opts = options || {};
  navQueue = navQueue.then(async () => {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) {
      location.assign(url.href);
      return;
    }
    const next = url.pathname + url.search + url.hash;
    const current = location.pathname + location.search + location.hash;
    if (next === current) return;
    if (opts.replace) history.replaceState({}, "", next);
    else history.pushState({}, "", next);
    try {
      await show(url.pathname);
    } finally {
      reveal();
    }
    if (opts.scroll !== false) window.scrollTo(0, 0);
  }).catch((error) => {
    console.error(error);
    reveal();
  });
}
function isInternalNavigation(anchor, event) {
  if (!anchor || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  try { return new URL(href, location.href).origin === location.origin; } catch { return false; }
}
window.__VISTA_NAVIGATE__ = navigate;
document.addEventListener("click", (event) => {
  const anchor = event.target && event.target.closest ? event.target.closest("a") : null;
  if (!isInternalNavigation(anchor, event)) return;
  event.preventDefault();
  navigate(anchor.getAttribute("href"));
}, true);
window.addEventListener("popstate", () => {
  navQueue = navQueue.then(async () => {
    try {
      await show(location.pathname);
    } finally {
      reveal();
    }
  }).catch((error) => {
    console.error(error);
    reveal();
  });
});
`;

function isInside(file, dir) {
  const relative = path.relative(dir, file);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function inlineFsShim() {
  const files = {};
  const root = path.join(cwd, 'content');
  const walkFiles = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkFiles(full);
      else if (entry.name.endsWith('.md')) {
        const relative = path.relative(cwd, full).replaceAll('\\', '/');
        const text = fs.readFileSync(full, 'utf8');
        files[`/${relative}`] = text;
        files[`/_flashpack/modules/${relative}`] = text;
      }
    }
  };
  walkFiles(root);
  return `const files = ${JSON.stringify(files)};
function keyOf(target) {
  const href = typeof target === "string" ? target : (target && target.href) || String(target);
  try { return new URL(href, "http://flashpack.local").pathname; } catch { return String(href); }
}
export function readFileSync(target) {
  const key = keyOf(target);
  if (Object.prototype.hasOwnProperty.call(files, key)) return files[key];
  const error = new Error("ENOENT: " + key);
  error.code = "ENOENT";
  throw error;
}
export function existsSync(target) {
  return Object.prototype.hasOwnProperty.call(files, keyOf(target));
}
export default { readFileSync, existsSync };
`;
}

const esbuild = loadEsbuild();
const modulesDir = path.join(cwd, '.flash', 'dev', 'modules');
const shimsDir = path.join(cwd, '.flash', 'dev', 'ssr');
const appRequire = createRequire(path.join(cwd, 'package.json'));

fs.mkdirSync(path.dirname(outfile), { recursive: true });
await esbuild.build({
  absWorkingDir: cwd,
  stdin: {
    contents: source,
    resolveDir: modulesDir,
    sourcefile: 'flashpack-boot.js',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  outfile,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"development"' },
  mainFields: ['browser', 'module', 'main'],
  plugins: [
    {
      name: 'flashpack-boot',
      setup(build) {
        build.onResolve({ filter: /^\/_flashpack\/modules\// }, (args) => {
          const rel = args.path.slice('/_flashpack/modules/'.length).split('?')[0];
          return { path: path.join(modulesDir, rel) };
        });
        build.onResolve({ filter: /^\/_flashpack\/shims\// }, (args) => {
          const rel = args.path.slice('/_flashpack/shims/'.length).split('?')[0];
          if (rel === 'fs.js') return { path: 'fs.js', namespace: 'flashpack-fs' };
          return { path: path.join(shimsDir, rel) };
        });
        build.onLoad({ filter: /.*/, namespace: 'flashpack-fs' }, () => ({
          contents: inlineFsShim(),
          loader: 'js',
        }));
        build.onLoad({ filter: /\.js$/ }, (args) => {
          if (!isInside(args.path, modulesDir)) return null;
          const contents = fs.readFileSync(args.path, 'utf8');
          if (!contents.includes('import.meta.url')) return null;
          const relative = path.relative(modulesDir, args.path).replaceAll('\\', '/');
          const rewritten = contents.replaceAll(
            'import.meta.url',
            `(location.origin + ${JSON.stringify(`/_flashpack/modules/${relative}`)})`
          );
          return { contents: rewritten, loader: 'js' };
        });
        build.onResolve({ filter: /^\/_flashpack\/mod\// }, (args) => {
          const spec = args.path.slice('/_flashpack/mod/'.length).split('?')[0];
          return { path: appRequire.resolve(spec) };
        });
        build.onResolve({ filter: /^\/_flashpack\/empty\.js/ }, () => ({
          path: path.join(shimsDir, 'empty.js'),
        }));
      },
    },
  ],
});
