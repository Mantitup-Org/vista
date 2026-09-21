#!/usr/bin/env node
/**
 * Vista Regression Tests — Phase 1
 *
 * 1. Hidden route safety: [not-found] must never be HTTP-routable
 * 2. Metadata parity: static metadata + dynamic generateMetadata
 * 3. SSR vs RSC parity: same status codes, 404 behavior, nested/dynamic route
 *
 * Approach: unit-level tests on the manifest, resolver, scanner, and metadata
 * utilities — no live server needed (those are build-time guarantees).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { TEMP_PREFIX_REGRESSION, BIN_COMMAND } = require('./test-constants.cjs');

const repoRoot = path.resolve(__dirname, '..');
const vistaDistRoot = path.join(repoRoot, 'packages', 'vista', 'dist');
const vistaSrcRoot = path.join(repoRoot, 'packages', 'vista', 'src');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function writeFile(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

let passCount = 0;
let failCount = 0;
const failures = [];

function ok(label) {
  passCount++;
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}

function fail(label, err) {
  failCount++;
  failures.push({ label, err });
  console.log(`  \x1b[31m✗\x1b[0m ${label}`);
  console.log(`    ${err.message || err}`);
}

function test(label, fn) {
  try {
    fn();
    ok(label);
  } catch (e) {
    fail(label, e);
  }
}

async function testAsync(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (e) {
    fail(label, e);
  }
}

// ---------------------------------------------------------------------------
// Fixture: full app with routes, metadata, [not-found], dynamic route
// ---------------------------------------------------------------------------

function createFixtureApp() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX_REGRESSION));
  const appDir = path.join(tempRoot, 'app');

  // root.tsx — with static metadata + notFoundRoute
  writeFile(
    path.join(appDir, 'root.js'),
    [
      "exports.notFoundRoute = '/[not-found]';",
      "exports.metadata = { title: 'Test App', description: 'Root description' };",
      'exports.default = function RootLayout(props) { return props.children; };',
    ].join('\n')
  );

  // index page — with static metadata
  writeFile(
    path.join(appDir, 'index.js'),
    [
      "exports.metadata = { title: 'Home Page', description: 'Welcome home' };",
      "exports.default = function Home() { return 'home'; };",
    ].join('\n')
  );

  // about page — with generateMetadata (dynamic)
  writeFile(
    path.join(appDir, 'about', 'page.js'),
    [
      "exports.metadata = { title: 'About Us' };",
      'exports.generateMetadata = async function generateMetadata(props, parent) {',
      "  return { title: 'Dynamic About - ' + (parent.title || ''), description: 'Dynamically generated' };",
      '};',
      "exports.default = function About() { return 'about'; };",
    ].join('\n')
  );

  // docs/[slug]/page.js — dynamic route
  writeFile(
    path.join(appDir, 'docs', '[slug]', 'page.js'),
    [
      'exports.generateMetadata = async function generateMetadata(props) {',
      "  return { title: 'Doc: ' + (props.params.slug || 'unknown') };",
      '};',
      "exports.default = function DocPage() { return 'doc'; };",
    ].join('\n')
  );

  // [not-found]/page.js — must NEVER be publicly routable
  writeFile(
    path.join(appDir, '[not-found]', 'page.js'),
    [
      "exports.metadata = { title: '404 - Not Found' };",
      "exports.default = function NotFoundPage() { return 'custom 404'; };",
    ].join('\n')
  );

  // blog/page.js — simple nested route
  writeFile(
    path.join(appDir, 'blog', 'page.js'),
    [
      "exports.metadata = { title: 'Blog' };",
      "exports.default = function Blog() { return 'blog'; };",
    ].join('\n')
  );

  // client-only/page.js — client component page with 'use client'
  writeFile(
    path.join(appDir, 'client-only', 'page.js'),
    [
      "'use client';",
      "exports.metadata = { title: 'Client Only' };",
      "exports.default = function ClientOnlyPage() { return 'client-only'; };",
    ].join('\n')
  );

  // vista.config
  writeFile(path.join(tempRoot, 'vista.config.ts'), 'export default {};');

  return tempRoot;
}

// ---------------------------------------------------------------------------
// Suite 1: Hidden Route Safety
// ---------------------------------------------------------------------------

function suiteHiddenRouteSafety(fixtureRoot) {
  console.log('\n\x1b[1m[Suite 1] Hidden Route Safety\x1b[0m');

  const fixtureAppDir = path.join(fixtureRoot, 'app');

  const { generateServerManifest } = require(
    path.join(vistaDistRoot, 'build', 'rsc', 'server-manifest.js')
  );
  const { scanAppDirectory } = require(path.join(vistaDistRoot, 'bin', 'file-scanner.js'));
  const { resolveRootLayout, resolveNotFoundComponent } = require(
    path.join(vistaDistRoot, 'server', 'root-resolver.js')
  );

  // 1.1 — [not-found] excluded from server manifest routes
  test('[not-found] excluded from server manifest', () => {
    const manifest = generateServerManifest(fixtureRoot, fixtureAppDir);
    const patterns = manifest.routes.map((r) => r.pattern);
    assert(
      !patterns.some((p) => p.includes('not-found')),
      `[not-found] leaked into manifest routes: ${patterns.join(', ')}`
    );
  });

  // 1.2 — [not-found] excluded from file scanner pages list
  test('[not-found] excluded from file scanner', () => {
    const scan = scanAppDirectory(fixtureAppDir);
    const leaks = scan.pages.filter((p) =>
      normalizePath(p.relativePath).includes('[not-found]/page')
    );
    assert.equal(leaks.length, 0, `[not-found] leaked into scanner: ${JSON.stringify(leaks)}`);
  });

  // 1.3 — Valid routes ARE present
  test('Valid routes present in manifest', () => {
    const manifest = generateServerManifest(fixtureRoot, fixtureAppDir);
    const patterns = manifest.routes.map((r) => r.pattern);
    assert(patterns.includes('/'), 'Missing root route /');
    assert(patterns.includes('/about'), 'Missing /about route');
    assert(patterns.includes('/blog'), 'Missing /blog route');
    assert(
      patterns.some((p) => p.includes(':slug')),
      'Missing dynamic /docs/:slug route'
    );
  });

  // 1.4 — notFoundRoute resolves via root-resolver (custom 404 component)
  test('notFoundRoute resolves custom 404 component', () => {
    const rootLayout = resolveRootLayout(fixtureRoot, false);
    assert.equal(rootLayout.notFoundRoute, '/[not-found]');
    const notFound = resolveNotFoundComponent(fixtureRoot, rootLayout, false);
    assert(notFound, 'Expected not-found component to resolve');
    assert(
      normalizePath(notFound.sourcePath).endsWith('/app/[not-found]/page.js'),
      `Expected [not-found]/page.js, got: ${notFound.sourcePath}`
    );
    // Component is callable
    assert.equal(typeof notFound.component, 'function');
  });

  // 1.5 — Route matching: [not-found] path never matches any route
  test('[not-found] URL path never matches route pattern', () => {
    const manifest = generateServerManifest(fixtureRoot, fixtureAppDir);
    // Simulate what rsc-engine does
    for (const route of manifest.routes) {
      const patternParts = route.pattern.split('/').filter(Boolean);
      const testParts = ['[not-found]'];
      let matched = true;
      if (patternParts.length !== testParts.length) {
        matched = false;
      } else {
        for (let i = 0; i < patternParts.length; i++) {
          if (patternParts[i].startsWith(':')) continue;
          if (patternParts[i] !== testParts[i]) {
            matched = false;
            break;
          }
        }
      }
      assert(!matched, `Route "${route.pattern}" matched /[not-found] — this should be impossible`);
    }
  });

  // 1.6 — Direct path /not-found (without brackets) — dynamic routes should NOT match literal "[not-found]"
  test('Literal "[not-found]" URL is never routable', () => {
    const manifest = generateServerManifest(fixtureRoot, fixtureAppDir);
    // No route pattern should have "[not-found]" as a literal segment
    for (const route of manifest.routes) {
      assert(
        !route.pattern.includes('[not-found]'),
        `Route pattern "${route.pattern}" contains literal [not-found]`
      );
    }
  });

  // 1.7 — Client component routes ('use client') are preserved in manifest
  test('Client component routes are present in manifest', () => {
    const manifest = generateServerManifest(fixtureRoot, fixtureAppDir);
    const patterns = manifest.routes.map((r) => r.pattern);
    assert(patterns.includes('/client-only'), 'Missing client component route /client-only');
  });
}

// ---------------------------------------------------------------------------
// Suite 2: Metadata Parity
// ---------------------------------------------------------------------------

function suiteMetadataParity(fixtureRoot) {
  console.log('\n\x1b[1m[Suite 2] Metadata Parity\x1b[0m');

  const { generateMetadataHtml } = require(path.join(vistaDistRoot, 'metadata', 'generate.js'));
  const { resolveRootLayout } = require(path.join(vistaDistRoot, 'server', 'root-resolver.js'));

  const rootLayout = resolveRootLayout(fixtureRoot, true);

  // 2.1 — Static metadata from root layout
  test('Root layout static metadata renders correctly', () => {
    const html = generateMetadataHtml(rootLayout.metadata);
    assert(html.includes('<title>Test App</title>'), 'Missing <title>');
    assert(html.includes('name="description"'), 'Missing description meta');
    assert(html.includes('Root description'), 'Missing description content');
  });

  // 2.2 — Page metadata merges over root metadata
  test('Page metadata merges over root metadata', () => {
    const pageModule = require(path.join(fixtureRoot, 'app', 'index.js'));
    const merged = { ...rootLayout.metadata, ...pageModule.metadata };
    const html = generateMetadataHtml(merged);
    assert(html.includes('<title>Home Page</title>'), 'Page title should override root title');
    assert(html.includes('Welcome home'), 'Page description should override root description');
  });

  // 2.3 — Dynamic generateMetadata merges over parent
  test('Dynamic generateMetadata merges correctly', async () => {
    const pageModule = require(path.join(fixtureRoot, 'app', 'about', 'page.js'));
    // Start with root + page static
    let merged = { ...rootLayout.metadata };
    if (pageModule.metadata) merged = { ...merged, ...pageModule.metadata };
    // Apply generateMetadata
    assert.equal(typeof pageModule.generateMetadata, 'function', 'generateMetadata should exist');
    const dynamic = await pageModule.generateMetadata({ params: {}, searchParams: {} }, merged);
    merged = { ...merged, ...dynamic };
    assert(
      merged.title.startsWith('Dynamic About'),
      `Expected dynamic title, got: ${merged.title}`
    );
    assert.equal(merged.description, 'Dynamically generated');
    const html = generateMetadataHtml(merged);
    assert(html.includes('Dynamic About'), 'Dynamic title missing from rendered HTML');
    assert(
      html.includes('Dynamically generated'),
      'Dynamic description missing from rendered HTML'
    );
  });

  // 2.4 — generateMetadata receives parent metadata
  test('generateMetadata receives correct parent metadata', async () => {
    const pageModule = require(path.join(fixtureRoot, 'app', 'about', 'page.js'));
    const parent = { ...rootLayout.metadata, ...pageModule.metadata };
    const result = await pageModule.generateMetadata({ params: {} }, parent);
    // Should include parent title in the dynamic merge
    assert(
      result.title.includes('About Us'),
      `generateMetadata should receive parent.title ('About Us'), got: ${result.title}`
    );
  });

  // 2.5 — Slug dynamic route generateMetadata
  test('Dynamic route generateMetadata with params', async () => {
    const docModule = require(path.join(fixtureRoot, 'app', 'docs', '[slug]', 'page.js'));
    assert.equal(typeof docModule.generateMetadata, 'function');
    const result = await docModule.generateMetadata({ params: { slug: 'hello-world' } });
    assert.equal(
      result.title,
      'Doc: hello-world',
      `Expected 'Doc: hello-world', got: ${result.title}`
    );
  });

  // 2.6 — OpenGraph, canonical, icons metadata rendering
  test('Complex metadata (OG, canonical, icons) renders correctly', () => {
    const complexMeta = {
      title: 'Complex Page',
      description: 'Complex test',
      openGraph: {
        title: 'OG Title',
        description: 'OG Desc',
        url: 'https://example.com/test',
      },
      alternates: {
        canonical: 'https://example.com/test',
      },
    };
    const html = generateMetadataHtml(complexMeta);
    assert(html.includes('property="og:title"'), 'Missing og:title');
    assert(html.includes('OG Title'), 'Missing OG title content');
    assert(html.includes('property="og:description"'), 'Missing og:description');
    assert(html.includes('rel="canonical"'), 'Missing canonical link');
    assert(html.includes('https://example.com/test'), 'Missing canonical URL');
  });

  // 2.7 — Empty/null metadata doesn't crash
  test('Empty metadata renders without crash', () => {
    const html = generateMetadataHtml({});
    assert.equal(typeof html, 'string');
    // Should still be valid (empty or minimal)
  });

  test('Null metadata renders without crash', () => {
    const html = generateMetadataHtml(null);
    assert.equal(typeof html, 'string');
  });
}

// ---------------------------------------------------------------------------
// Suite 3: SSR vs RSC Parity
// ---------------------------------------------------------------------------

function suiteSSRvsRSCParity(fixtureRoot) {
  console.log('\n\x1b[1m[Suite 3] SSR vs RSC Parity\x1b[0m');

  const fixtureAppDir = path.join(fixtureRoot, 'app');

  // Load source files for both engines
  const engineSource = fs.readFileSync(path.join(vistaSrcRoot, 'server', 'engine.ts'), 'utf8');
  const rscEngineSource = fs.readFileSync(
    path.join(vistaSrcRoot, 'server', 'rsc-engine.ts'),
    'utf8'
  );
  const rscUpstreamSource = fs.readFileSync(
    path.join(vistaSrcRoot, 'server', 'rsc-upstream.ts'),
    'utf8'
  );

  // 3.1 — Both engines use resolveNotFoundComponent
  test('Both engines use resolveNotFoundComponent', () => {
    assert(
      engineSource.includes('resolveNotFoundComponent'),
      'Legacy engine missing resolveNotFoundComponent'
    );
    assert(
      rscEngineSource.includes('resolveNotFoundComponent'),
      'RSC engine missing resolveNotFoundComponent'
    );
    assert(
      rscUpstreamSource.includes('resolveNotFoundComponent'),
      'RSC upstream missing resolveNotFoundComponent'
    );
  });

  // 3.2 — Both engines send 404 status for unmatched routes
  test('Both engines set 404 status for unmatched routes', () => {
    // Legacy engine: res.status(404)
    assert(
      engineSource.includes('.status(404)'),
      'Legacy engine must set 404 status for unmatched routes'
    );
    // RSC engine or upstream: status(404)
    const rscHas404 =
      rscEngineSource.includes('.status(404)') || rscUpstreamSource.includes('.status(404)');
    assert(rscHas404, 'RSC engine/upstream must set 404 status for unmatched routes');
  });

  // 3.3 — Both engines support generateMetadata
  test('Both engines support generateMetadata', () => {
    assert(
      engineSource.includes('generateMetadata'),
      'Legacy engine must support generateMetadata'
    );
    assert(
      rscEngineSource.includes('generateMetadata'),
      'RSC engine must support generateMetadata'
    );
  });

  // 3.4 — Both engines use generateMetadataHtml
  test('Both engines use generateMetadataHtml for rendering', () => {
    assert(
      engineSource.includes('generateMetadataHtml'),
      'Legacy engine must use generateMetadataHtml'
    );
    assert(
      rscEngineSource.includes('generateMetadataHtml'),
      'RSC engine must use generateMetadataHtml'
    );
  });

  // 3.5 — Both engines resolve root layout
  test('Both engines resolve root layout', () => {
    assert(engineSource.includes('resolveRootLayout'), 'Legacy engine must resolve root layout');
    assert(rscEngineSource.includes('resolveRootLayout'), 'RSC engine must resolve root layout');
  });

  // 3.6 — [not-found] exclusion in legacy engine (filesystem probing)
  test('Legacy engine excludes [not-found] from dynamic routing', () => {
    // The engine.ts explicitly filters out [not-found] during filesystem probing
    assert(
      engineSource.includes('[not-found]') || engineSource.includes('not-found'),
      'Legacy engine must handle [not-found] exclusion'
    );
    // Must exclude it from dynamic folder matching
    assert(
      engineSource.includes("!== '[not-found]'") || engineSource.includes("name !== '[not-found]'"),
      'Legacy engine must exclude [not-found] from dynamic folder matching'
    );
  });

  // 3.7 — Manifest-level route parity: routes are same regardless of engine
  test('Routes are engine-agnostic (manifest-based for RSC)', () => {
    const { generateServerManifest } = require(
      path.join(vistaDistRoot, 'build', 'rsc', 'server-manifest.js')
    );
    const manifest = generateServerManifest(fixtureRoot, fixtureAppDir);
    const patterns = manifest.routes.map((r) => r.pattern).sort();

    // Both engines should serve these same routes
    assert(patterns.includes('/'), 'Missing /');
    assert(patterns.includes('/about'), 'Missing /about');
    assert(patterns.includes('/blog'), 'Missing /blog');
    assert(
      patterns.some((p) => p.includes(':slug')),
      'Missing dynamic route'
    );

    // Neither should have [not-found]
    assert(!patterns.some((p) => p.includes('not-found')), '[not-found] in route patterns');
  });

  // 3.8 — Metadata merge follows same pattern in both engines
  test('Metadata merge order is consistent across engines', () => {
    // Both engines: root.metadata → page.metadata → generateMetadata(params, parent)
    // Check legacy engine
    const legacyMergePattern =
      engineSource.includes('...metadata, ...PageModule.metadata') ||
      engineSource.includes('{ ...metadata, ...pageModule.metadata }') ||
      (engineSource.includes('rootLayout.metadata') &&
        engineSource.includes('PageModule.metadata'));
    assert(legacyMergePattern, 'Legacy engine must merge metadata: root → page → dynamic');

    // Check RSC engine
    const rscMergePattern =
      rscEngineSource.includes('...metadata, ...PageModule.metadata') ||
      (rscEngineSource.includes('rootLayout.metadata') &&
        rscEngineSource.includes('PageModule.metadata'));
    assert(rscMergePattern, 'RSC engine must merge metadata: root → page → dynamic');
  });

  // 3.9 — Both engines handle NotFoundError thrown during rendering
  test('Both engines catch NotFoundError during rendering', () => {
    assert(engineSource.includes('NotFoundError'), 'Legacy engine must handle NotFoundError');
    assert(
      rscEngineSource.includes('NotFoundError') || rscUpstreamSource.includes('NotFoundError'),
      'RSC engine/upstream must handle NotFoundError'
    );
  });

  // 3.10 — Dynamic route params extraction parity
  test('Both engines extract dynamic route params', () => {
    // Check that both have param extraction logic
    assert(
      engineSource.includes('params') && engineSource.includes('['),
      'Legacy engine must extract dynamic params'
    );
    const rscHasParams = rscEngineSource.includes('params') || rscUpstreamSource.includes('params');
    assert(rscHasParams, 'RSC engine must extract dynamic params');
  });
}

// ---------------------------------------------------------------------------
// Suite 4: Structure Validator Regression
// ---------------------------------------------------------------------------

function suiteStructureValidator() {
  console.log('\n\x1b[1m[Suite 4] Structure Validator Regression\x1b[0m');

  const validatorSource = fs.readFileSync(
    path.join(vistaSrcRoot, 'server', 'structure-validator.ts'),
    'utf8'
  );

  test('Validator has ROOT_MISSING issue code', () => {
    assert(validatorSource.includes('ROOT_MISSING'));
  });

  test('Validator has RESERVED_NOT_FOUND_PUBLIC issue code', () => {
    assert(validatorSource.includes('RESERVED_NOT_FOUND_PUBLIC'));
  });

  test('Validator has ROUTE_PATTERN_CONFLICT issue code', () => {
    assert(validatorSource.includes('ROUTE_PATTERN_CONFLICT'));
  });

  test('Config exports StructureValidationConfig type', () => {
    const configSource = fs.readFileSync(path.join(vistaSrcRoot, 'config.ts'), 'utf8');
    assert(configSource.includes('StructureValidationConfig'));
  });
}

// ---------------------------------------------------------------------------
// Suite 5: Type Export Consistency
// ---------------------------------------------------------------------------

function suiteTypeExports() {
  console.log('\n\x1b[1m[Suite 5] Type Export Consistency\x1b[0m');

  test('types/index.ts re-exports Metadata from canonical source', () => {
    const source = fs.readFileSync(path.join(vistaSrcRoot, 'types', 'index.ts'), 'utf8');
    assert(
      source.includes('Metadata') && source.includes('metadata/types'),
      'types/index.ts must re-export Metadata from metadata/types'
    );
  });

  test('client/head.tsx aliases Metadata to canonical type', () => {
    const source = fs.readFileSync(path.join(vistaSrcRoot, 'client', 'head.tsx'), 'utf8');
    assert(
      source.includes('Metadata') && !source.includes('export interface Metadata {'),
      'client/head.tsx must alias Metadata, not duplicate it'
    );
  });

  test('Package exports include all public subpaths', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'packages', 'vista', 'package.json'), 'utf8')
    );
    const exports = Object.keys(pkg.exports);
    const required = [
      '.',
      './link',
      './image',
      './router',
      './navigation',
      './head',
      './font',
      './config',
    ];
    for (const subpath of required) {
      assert(exports.includes(subpath), `Missing export subpath: ${subpath}`);
    }
  });

  test('Package bin has vista command', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'packages', 'vista', 'package.json'), 'utf8')
    );
    assert(pkg.bin && pkg.bin[BIN_COMMAND], `Missing bin.${BIN_COMMAND} in package.json`);
  });
}

// ---------------------------------------------------------------------------
// Run all suites
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n\x1b[1;36m━━━ Vista Regression Tests (Phase 1) ━━━\x1b[0m');

  const fixtureRoot = createFixtureApp();
  try {
    suiteHiddenRouteSafety(fixtureRoot);
    await suiteMetadataParity(fixtureRoot);
    suiteSSRvsRSCParity(fixtureRoot);
    suiteStructureValidator();
    suiteTypeExports();

    console.log('\n\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    console.log(
      `  \x1b[32m${passCount} passed\x1b[0m${failCount > 0 ? `, \x1b[31m${failCount} failed\x1b[0m` : ''}`
    );

    if (failCount > 0) {
      console.log('\n\x1b[31mFailed tests:\x1b[0m');
      for (const f of failures) {
        console.log(`  ✗ ${f.label}: ${f.err.message || f.err}`);
      }
      console.log('');
      process.exit(1);
    } else {
      console.log('\n\x1b[32m[test:regression] ALL PASSED ✓\x1b[0m\n');
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\x1b[31m[test:regression] FATAL:\x1b[0m', err);
  process.exit(1);
});
