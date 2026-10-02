import fs from 'node:fs';
import path from 'node:path';
import { createRequire, register } from 'node:module';
import { pathToFileURL } from 'node:url';

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return '';
  return process.argv[index + 1];
}

const cwd = path.resolve(readArg('--cwd') || process.cwd());
const requestPath = readArg('--path') || '/';
const modulesDir = path.join(cwd, '.flash', 'dev', 'modules');
const shimsDir = path.join(cwd, '.flash', 'dev', 'ssr');

const registered = register(new URL('./flashpack-ssr-loader.mjs', import.meta.url), {
  parentURL: import.meta.url,
  data: { modulesDir, shimsDir },
});
if (registered && typeof registered.then === 'function') {
  await registered;
}

function moduleFile(relativePath) {
  const file = path.join(modulesDir, ...relativePath.split('/'));
  return fs.existsSync(file) ? file : null;
}

const appRequire = createRequire(path.join(cwd, 'package.json'));
const { createElement } = appRequire('react');
const { renderToReadableStream } = appRequire('react-dom/server');

const rootFile = moduleFile('app/root.tsx.js') || moduleFile('app/root.jsx.js');
if (!rootFile) {
  throw new Error('flashpack ssr: app/root was not compiled');
}

const pathname = requestPath.replace(/\/$/, '') || '/';
let pageFile = null;
let pageProps = {};
let layoutFile = null;

if (pathname === '/docs' || pathname.startsWith('/docs/')) {
  layoutFile = moduleFile('app/docs/layout.tsx.js');
  if (pathname === '/docs') {
    pageFile = moduleFile('app/docs/page.tsx.js');
  } else {
    pageFile = moduleFile('app/docs/[...slug]/page.tsx.js');
    pageProps = { params: { slug: pathname.split('/').filter(Boolean).slice(1) } };
  }
}

if (!pageFile) {
  pageFile =
    moduleFile('app/index.tsx.js') ||
    moduleFile('app/index.jsx.js') ||
    moduleFile('app/page.tsx.js') ||
    moduleFile('app/page.jsx.js');
}

if (!pageFile) {
  throw new Error(`flashpack ssr: no page module for ${pathname}`);
}

const rootMod = await import(pathToFileURL(rootFile).href);
const pageMod = await import(pathToFileURL(pageFile).href);
const Root = rootMod.default;
const Page = pageMod.default;
let page = createElement(Page, pageProps);
if (page && typeof page.then === 'function') {
  page = await page;
}
if (layoutFile) {
  const layoutMod = await import(pathToFileURL(layoutFile).href);
  page = createElement(layoutMod.default, { children: page });
}

const stream = await renderToReadableStream(createElement(Root, { children: page }));
await stream.allReady;
process.stdout.write(await new Response(stream).text());
