#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const rustBridge = require(path.join(repoRoot, 'crates', 'vista-napi'));

function writeFile(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function main() {
  const identity = rustBridge.getFrameworkIdentity();
  assert.equal(identity.name, 'vista');
  assert.equal(rustBridge.verifyIntegrity(identity.integrityToken), true);
  assert.equal(rustBridge.isClientComponent("'use client';\nexport default function Demo() {}"), true);

  const metadataInfo = rustBridge.analyzeMetadata(
    "export const metadata = { title: 'Demo' };\nexport async function generateMetadata() { return { title: 'Demo' }; }"
  );
  assert.equal(metadataInfo.hasStaticMetadata, true);
  assert.equal(metadataInfo.hasGenerateMetadata, true);

  const vistaSourceRoot = path.join(repoRoot, 'packages', 'vista', 'src');
  const imageImport = rustBridge.resolveVistaSourceImport('vista/image', vistaSourceRoot);
  assert.equal(imageImport.normalizedRequest, 'vista/image');
  assert(imageImport.candidateBases.includes('image/react-server'));
  assert(
    imageImport.resolvedPath.endsWith(path.join('packages', 'vista', 'src', 'image', 'react-server.tsx')),
    'vista/image should resolve to the react-server source entry'
  );
  const headImport = rustBridge.resolveVistaSourceImport('vista/head', vistaSourceRoot);
  assert(headImport.candidateBases.includes('client/head.react-server'));
  assert.equal(rustBridge.resolveVistaSourceImport('react', vistaSourceRoot), null);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-rust-bridge-'));
  const appDir = path.join(tempRoot, 'app');

  try {
    writeFile(
      path.join(appDir, 'root.js'),
      "exports.default = function Root(props) { return props.children; };"
    );
    writeFile(
      path.join(appDir, 'index.js'),
      [
        "const Counter = require('./counter.js').default;",
        "exports.default = function Home() { return Counter(); };",
      ].join('\n')
    );
    writeFile(
      path.join(appDir, 'counter.js'),
      [
        "'use client';",
        'exports.default = function Counter() { return "counter"; };',
      ].join('\n')
    );
    writeFile(
      path.join(appDir, 'docs', '[slug]', 'page.js'),
      [
        'export async function generateMetadata({ params }) {',
        '  return { title: `Doc ${params.slug}` };',
        '}',
        'export default function Page() { return "doc"; }',
      ].join('\n')
    );

    const tree = rustBridge.getRouteTree(appDir);
    assert.equal(tree.kind, 'static');
    assert(Array.isArray(tree.children), 'route tree should contain children');

    const scan = rustBridge.rscScanApp(appDir);
    assert(scan.totalFiles >= 3, 'scan should detect app files');
    assert(scan.clientComponents.length >= 1, 'scan should detect client components');
    assert(scan.pages.length >= 1, 'scan should detect page files');

    const clientManifest = rustBridge.rscGenerateClientManifest(appDir, 'test-build');
    assert.equal(clientManifest.buildId, 'test-build');
    assert(clientManifest.clientModules.length >= 1, 'client manifest should include client modules');

    const serverManifest = rustBridge.rscGenerateServerManifest(appDir, 'test-build');
    assert.equal(serverManifest.buildId, 'test-build');
    assert(serverManifest.routes.length >= 1, 'server manifest should include routes');

    rustBridge.rscResetMountCounter();
    const mountIdA = rustBridge.rscGenerateMountId();
    const mountIdB = rustBridge.rscGenerateMountId();
    assert.notEqual(mountIdA, mountIdB, 'mount ids should be unique');

    console.log('[test:rust-bridge] OK');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error('[test:rust-bridge] FAILED');
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}
