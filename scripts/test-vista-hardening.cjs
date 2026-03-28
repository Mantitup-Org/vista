#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const vistaSrcRoot = path.join(repoRoot, 'packages', 'vista', 'src');
const vistaDistRoot = path.join(repoRoot, 'packages', 'vista', 'dist');

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function writeFile(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

const { TEMP_PREFIX_HARDENING } = require('./test-constants.cjs');

function makeTempAppFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX_HARDENING));
  const appDir = path.join(tempRoot, 'app');

  writeFile(
    path.join(appDir, 'root.js'),
    [
      "exports.notFoundRoute = '/[not-found]';",
      "exports.metadata = { title: 'Fixture Root' };",
      'exports.default = function RootLayout(props) { return props && props.children; };',
      '',
    ].join('\n')
  );

  writeFile(
    path.join(appDir, 'index.js'),
    ["exports.default = function Home() { return 'home'; };", ''].join('\n')
  );

  writeFile(
    path.join(appDir, 'docs', '[slug]', 'page.js'),
    ["exports.default = function DocPage() { return 'doc'; };", ''].join('\n')
  );

  writeFile(
    path.join(appDir, '[not-found]', 'page.js'),
    ["exports.default = function HiddenNotFound() { return 'hidden not found'; };", ''].join('\n')
  );

  writeFile(
    path.join(appDir, 'not-found.js'),
    ["exports.default = function LegacyNotFound() { return 'legacy not found'; };", ''].join('\n')
  );

  return tempRoot;
}

function run() {
  const { generateServerManifest } = require(
    path.join(vistaDistRoot, 'build', 'rsc', 'server-manifest.js')
  );
  const { scanAppDirectory } = require(path.join(vistaDistRoot, 'bin', 'file-scanner.js'));
  const { resolveRootLayout, resolveNotFoundComponent } = require(
    path.join(vistaDistRoot, 'server', 'root-resolver.js')
  );
  const { generateMetadataHtml } = require(path.join(vistaDistRoot, 'metadata', 'generate.js'));
  const { generateMetadataHead } = require(path.join(vistaDistRoot, 'client', 'head.js'));

  const fixtureRoot = makeTempAppFixture();
  const fixtureAppDir = path.join(fixtureRoot, 'app');

  try {
    // 1) Reserved route exclusion for [not-found]
    const manifest = generateServerManifest(fixtureRoot, fixtureAppDir);
    const routePatterns = manifest.routes.map((route) => route.pattern);

    assert(routePatterns.includes('/'), 'Expected root route pattern "/" in server manifest.');
    assert(
      routePatterns.includes('/docs/:slug'),
      'Expected dynamic docs route in server manifest.'
    );
    assert(
      !routePatterns.some((pattern) => pattern.includes('not-found')),
      'Reserved [not-found] route leaked into public route patterns.'
    );

    const scan = scanAppDirectory(fixtureAppDir);
    assert(
      !scan.pages.some((page) => normalizePath(page.relativePath).includes('[not-found]/page')),
      'Reserved [not-found]/page leaked into scanner pages list.'
    );

    // 2) Custom notFoundRoute still resolves via root resolver
    const rootLayout = resolveRootLayout(fixtureRoot, false);
    const notFound = resolveNotFoundComponent(fixtureRoot, rootLayout, false);
    assert(notFound, 'Expected notFound component to resolve for configured notFoundRoute.');
    assert(
      normalizePath(notFound.sourcePath).endsWith('/app/[not-found]/page.js'),
      `Expected custom [not-found]/page resolution, got: ${notFound.sourcePath}`
    );

    // 3) Metadata dual-mode parity
    const metadata = {
      title: 'Hardening Test',
      description: 'Metadata rendering smoke test',
      openGraph: {
        title: 'OG Hardening Test',
        description: 'OG Description',
        url: 'https://example.com/docs',
      },
      alternates: {
        canonical: 'https://example.com/docs',
      },
    };

    const metadataHtml = generateMetadataHtml(metadata);
    assert(
      metadataHtml.includes('<title>Hardening Test</title>'),
      'Missing <title> in generated metadata HTML.'
    );
    assert(
      metadataHtml.includes('name="description"'),
      'Missing description meta tag in metadata HTML.'
    );
    assert(
      metadataHtml.includes('property="og:title"'),
      'Missing OpenGraph title tag in metadata HTML.'
    );
    assert(
      metadataHtml.includes('rel="canonical"'),
      'Missing canonical link tag in metadata HTML.'
    );

    const metadataHeadElement = generateMetadataHead(metadata);
    assert(
      metadataHeadElement && typeof metadataHeadElement === 'object',
      'generateMetadataHead should return a React element.'
    );

    const clientHeadSource = fs.readFileSync(path.join(vistaSrcRoot, 'client', 'head.tsx'), 'utf8');
    assert(
      clientHeadSource.includes('export type Metadata = AppMetadata;'),
      'client/head.tsx must alias Metadata to canonical metadata/types.'
    );
    assert(
      !clientHeadSource.includes('export interface Metadata {'),
      'client/head.tsx should not maintain a duplicate Metadata interface.'
    );

    const typesIndexSource = fs.readFileSync(path.join(vistaSrcRoot, 'types', 'index.ts'), 'utf8');
    assert(
      typesIndexSource.includes("export type { Metadata } from '../metadata/types';"),
      'types/index.ts must re-export canonical metadata type.'
    );

    // 4) SSR/RSC parity source invariants
    const engineSource = fs.readFileSync(path.join(vistaSrcRoot, 'server', 'engine.ts'), 'utf8');
    const rscEngineSource = fs.readFileSync(
      path.join(vistaSrcRoot, 'server', 'rsc-engine.ts'),
      'utf8'
    );
    const rscUpstreamSource = fs.readFileSync(
      path.join(vistaSrcRoot, 'server', 'rsc-upstream.ts'),
      'utf8'
    );
    const staticGeneratorSource = fs.readFileSync(
      path.join(vistaSrcRoot, 'server', 'static-generator.ts'),
      'utf8'
    );
    const flashpackCommandSource = fs.readFileSync(
      path.join(vistaSrcRoot, 'flashpack', 'command.ts'),
      'utf8'
    );
    const spawnPermissionSource = fs.readFileSync(
      path.join(vistaSrcRoot, 'server', 'spawn-permissions.ts'),
      'utf8'
    );

    assert(
      engineSource.includes('resolveNotFoundComponent'),
      'SSR engine must resolve not-found component contract.'
    );
    assert(
      rscEngineSource.includes('resolveNotFoundComponent'),
      'RSC engine must resolve not-found component contract.'
    );
    assert(
      rscUpstreamSource.includes('resolveNotFoundComponent'),
      'RSC upstream must resolve not-found component contract.'
    );

    assert(
      spawnPermissionSource.includes('isPermissionDeniedSpawnError'),
      'spawn-permissions.ts must centralize permission-denied detection.'
    );
    assert(
      rscEngineSource.includes('upstreamUnavailableReason'),
      'RSC engine must track upstream unavailability instead of crashing.'
    );
    assert(
      rscEngineSource.includes('spawn blocked by environment permissions'),
      'RSC engine must surface permission-denied spawn failures clearly.'
    );
    assert(
      staticGeneratorSource.includes("from './spawn-permissions'"),
      'static-generator must share the centralized spawn permission helper.'
    );
    assert(
      flashpackCommandSource.includes('isPermissionDeniedSpawnError'),
      'flashpack command runner must use centralized spawn permission handling.'
    );

    // 5) Structure validator source invariants
    const structureValidatorSource = fs.readFileSync(
      path.join(vistaSrcRoot, 'server', 'structure-validator.ts'),
      'utf8'
    );
    assert(
      structureValidatorSource.includes('ROOT_MISSING'),
      'structure-validator must define ROOT_MISSING issue code.'
    );
    assert(
      structureValidatorSource.includes('RESERVED_NOT_FOUND_PUBLIC'),
      'structure-validator must define RESERVED_NOT_FOUND_PUBLIC issue code.'
    );
    assert(
      structureValidatorSource.includes('ROUTE_PATTERN_CONFLICT'),
      'structure-validator must define ROUTE_PATTERN_CONFLICT issue code.'
    );

    // 6) Not-found auto-detect: app/[not-found]/page.* takes precedence
    const autoDetectNotFound = resolveNotFoundComponent(fixtureRoot, rootLayout, false);
    assert(autoDetectNotFound, 'Expected auto-detect not-found component to resolve.');
    assert(
      normalizePath(autoDetectNotFound.sourcePath).endsWith('/app/[not-found]/page.js'),
      `Expected auto-detect [not-found]/page resolution, got: ${autoDetectNotFound.sourcePath}`
    );

    // 7) Explicit notFoundRoute override precedence
    assert.equal(
      rootLayout.notFoundRoute,
      '/[not-found]',
      'Root layout notFoundRoute should be /[not-found]'
    );

    // 8) config has validation.structure defaults
    const configSource = fs.readFileSync(path.join(vistaSrcRoot, 'config.ts'), 'utf8');
    assert(
      configSource.includes('validation'),
      'config.ts must include validation config surface.'
    );
    assert(
      configSource.includes('StructureValidationConfig'),
      'config.ts must export StructureValidationConfig type.'
    );

    console.log('[test:vista-hardening] OK');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error('[test:vista-hardening] FAILED');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
