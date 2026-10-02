const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const srcPath = path.join(root, 'packages/vista/src/bin/dev-error-overlay-snippet.ts');
const distPath = path.join(root, 'packages/vista/dist/bin/dev-error-overlay-snippet.js');
const src = fs.readFileSync(srcPath, 'utf8');

const marker = 'return String.raw`';
const start = src.indexOf(marker);
const end = src.lastIndexOf('`;');
if (start === -1 || end === -1 || end < start) {
  console.error('Could not locate String.raw payload');
  process.exit(1);
}
const body = src.slice(start + marker.length, end);
const out = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDevErrorOverlayBootstrapSource = getDevErrorOverlayBootstrapSource;
/**
 * Returns a JS snippet that installs the Vista dev error overlay.
 * It supports Next.js-style error pagination and indicator restore.
 */
function getDevErrorOverlayBootstrapSource() {
    return String.raw\`${body}\`;
}
`;
fs.writeFileSync(distPath, out);

const { getSharedDevClientSource } = require(path.join(root, 'packages/vista/dist/bin/dev-client-runtime'));
const client = getSharedDevClientSource(String(Date.now()));
const outClient = path.join(root, 'apps/web/.flash/dev/vista-dev.js');
fs.mkdirSync(path.dirname(outClient), { recursive: true });
fs.writeFileSync(outClient, client);
console.log('synced overlay + vista-dev.js', { dist: out.length, client: client.length });
