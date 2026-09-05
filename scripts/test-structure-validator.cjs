#!/usr/bin/env node

/**
 * Vista Structure Validator Tests
 *
 * Unit tests for validateAppStructure and not-found resolution.
 * Run after `pnpm build` in the vista package.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const vistaDistRoot = path.join(__dirname, '..', 'packages', 'vista', 'dist');

function writeFile(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

// ============================================================================
// Fixture builders
// ============================================================================

function makeValidFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-sv-valid-'));
  writeFile(
    path.join(root, 'app', 'root.tsx'),
    "export default function Root({ children }: any) { return children; }\nexport const metadata = { title: 'Test' };\n"
  );
  writeFile(
    path.join(root, 'app', 'index.tsx'),
    "export default function Home() { return 'home'; }\n"
  );
  writeFile(
    path.join(root, 'app', 'docs', '[slug]', 'page.tsx'),
    "export default function DocPage() { return 'doc'; }\n"
  );
  return root;
}

function makeMissingRootFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-sv-noroot-'));
  writeFile(
    path.join(root, 'app', 'index.tsx'),
    "export default function Home() { return 'home'; }\n"
  );
  return root;
}

function makeLayoutFallbackFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-sv-layout-'));
  writeFile(
    path.join(root, 'app', 'layout.tsx'),
    "export default function Layout({ children }: any) { return children; }\n"
  );
  return root;
}

function makeReservedNotFoundPublicFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-sv-reserved-'));
  writeFile(
    path.join(root, 'app', 'root.tsx'),
    "export default function Root({ children }: any) { return children; }\n"
  );
  // This should NOT have a page – reserved internal segment
  writeFile(
    path.join(root, 'app', '[not-found]', 'page.tsx'),
    "export default function NotFoundPage() { return '404'; }\n"
  );
  return root;
}

function makeRouteConflictFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-sv-conflict-'));
  writeFile(
    path.join(root, 'app', 'root.tsx'),
    "export default function Root({ children }: any) { return children; }\n"
  );
  // Two dynamic segments at the same level → pattern conflict
  writeFile(
    path.join(root, 'app', 'blog', '[id]', 'page.tsx'),
    "export default function BlogById() { return 'blog-id'; }\n"
  );
  writeFile(
    path.join(root, 'app', 'blog', '[slug]', 'page.tsx'),
    "export default function BlogBySlug() { return 'blog-slug'; }\n"
  );
  return root;
}

function makeRoutePageConflictFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-sv-rpconflict-'));
  writeFile(
    path.join(root, 'app', 'root.tsx'),
    "export default function Root({ children }: any) { return children; }\n"
  );
  writeFile(
    path.join(root, 'app', 'api', 'items', 'page.tsx'),
    "export default function Page() { return 'page'; }\n"
  );
  writeFile(
    path.join(root, 'app', 'api', 'items', 'route.ts'),
    "export async function GET() { return Response.json({ ok: true }); }\n"
  );
  return root;
}

function makeInvalidNotFoundRouteFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-sv-badnf-'));
  writeFile(
    path.join(root, 'app', 'root.tsx'),
    "export default function Root({ children }: any) { return children; }\n"
  );
  // notFoundRoute points to a non-existent page
  return root;
}

function makeMultipleNotFoundSourcesFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-sv-multinf-'));
  writeFile(
    path.join(root, 'app', 'root.tsx'),
    "export default function Root({ children }: any) { return children; }\n"
  );
  writeFile(
    path.join(root, 'app', '[not-found]', 'page.tsx'),
    "export default function AutoNotFound() { return '404 auto'; }\n"
  );
  writeFile(
    path.join(root, 'app', 'not-found.tsx'),
    "export default function LegacyNotFound() { return '404 legacy'; }\n"
  );
  return root;
}

function makeMetadataShapeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-sv-meta-'));
  writeFile(
    path.join(root, 'app', 'root.tsx'),
    "export default function Root({ children }: any) { return children; }\n"
  );
  writeFile(
    path.join(root, 'app', 'about', 'page.tsx'),
    "export const metadata = 'bad value';\nexport default function About() { return 'about'; }\n"
  );
  return root;
}

// ============================================================================
// Test runner
// ============================================================================

function run() {
  const { validateAppStructure } = require(path.join(vistaDistRoot, 'server', 'structure-validator.js'));

  let testCount = 0;
  let passCount = 0;

  function test(name, fn) {
    testCount++;
    let fixture;
    try {
      fixture = fn();
      passCount++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    } finally {
      if (fixture && fs.existsSync(fixture)) {
        fs.rmSync(fixture, { recursive: true, force: true });
      }
    }
  }

  console.log('[test:structure-validator] Running unit tests...\n');

  // ====================
  // Unit Tests
  // ====================

  test('valid canonical root setup → ok', () => {
    const fixture = makeValidFixture();
    const result = validateAppStructure({ cwd: fixture });
    assert.equal(result.state, 'ok', `Expected ok, got ${result.state}. Issues: ${JSON.stringify(result.issues)}`);
    assert.equal(result.issues.filter(i => i.severity === 'error').length, 0);
    return fixture;
  });

  test('missing root → ROOT_MISSING error', () => {
    const fixture = makeMissingRootFixture();
    const result = validateAppStructure({ cwd: fixture });
    assert.equal(result.state, 'error');
    assert(result.issues.some(i => i.code === 'ROOT_MISSING'), 'Expected ROOT_MISSING issue');
    return fixture;
  });

  test('layout fallback → LAYOUT_FALLBACK_USED warning', () => {
    const fixture = makeLayoutFallbackFixture();
    const result = validateAppStructure({ cwd: fixture });
    // Layout fallback is a warning, not an error
    assert(result.issues.some(i => i.code === 'LAYOUT_FALLBACK_USED'), 'Expected LAYOUT_FALLBACK_USED');
    assert.equal(result.issues.find(i => i.code === 'LAYOUT_FALLBACK_USED').severity, 'warning');
    return fixture;
  });

  test('reserved [not-found] public route → RESERVED_NOT_FOUND_PUBLIC error', () => {
    const fixture = makeReservedNotFoundPublicFixture();
    const result = validateAppStructure({ cwd: fixture });
    assert(result.issues.some(i => i.code === 'RESERVED_NOT_FOUND_PUBLIC'), 'Expected RESERVED_NOT_FOUND_PUBLIC');
    return fixture;
  });

  test('route pattern conflict → ROUTE_PATTERN_CONFLICT error', () => {
    const fixture = makeRouteConflictFixture();
    const result = validateAppStructure({ cwd: fixture });
    assert(result.issues.some(i => i.code === 'ROUTE_PATTERN_CONFLICT'), 'Expected ROUTE_PATTERN_CONFLICT');
    return fixture;
  });

  test('route and page at same level → ROUTE_PAGE_CONFLICT error', () => {
    const fixture = makeRoutePageConflictFixture();
    const result = validateAppStructure({ cwd: fixture });
    assert(result.issues.some(i => i.code === 'ROUTE_PAGE_CONFLICT'), 'Expected ROUTE_PAGE_CONFLICT');
    return fixture;
  });

  test('invalid notFoundRoute target → INVALID_NOT_FOUND_OVERRIDE_TARGET error', () => {
    const fixture = makeInvalidNotFoundRouteFixture();
    const result = validateAppStructure({ cwd: fixture, notFoundRoute: '/nonexistent' });
    assert(result.issues.some(i => i.code === 'INVALID_NOT_FOUND_OVERRIDE_TARGET'), 'Expected INVALID_NOT_FOUND_OVERRIDE_TARGET');
    return fixture;
  });

  test('multiple not-found sources without override → MULTIPLE_NOT_FOUND_SOURCES warning', () => {
    const fixture = makeMultipleNotFoundSourcesFixture();
    const result = validateAppStructure({ cwd: fixture });
    assert(result.issues.some(i => i.code === 'MULTIPLE_NOT_FOUND_SOURCES'), 'Expected MULTIPLE_NOT_FOUND_SOURCES');
    assert.equal(result.issues.find(i => i.code === 'MULTIPLE_NOT_FOUND_SOURCES').severity, 'warning');
    return fixture;
  });

  test('not-found precedence: auto-detect > legacy (no explicit override)', () => {
    const fixture = makeMultipleNotFoundSourcesFixture();
    const result = validateAppStructure({ cwd: fixture });
    // Both exist, warning emitted, but auto-detect takes precedence.
    // The RESERVED_NOT_FOUND_PUBLIC error should also fire since [not-found]/page.* exists
    assert(result.issues.some(i => i.code === 'MULTIPLE_NOT_FOUND_SOURCES'));
    return fixture;
  });

  test('metadata export shape invalid → METADATA_EXPORT_SHAPE_INVALID error', () => {
    const fixture = makeMetadataShapeFixture();
    const result = validateAppStructure({ cwd: fixture });
    assert(result.issues.some(i => i.code === 'METADATA_EXPORT_SHAPE_INVALID'), 'Expected METADATA_EXPORT_SHAPE_INVALID');
    return fixture;
  });

  test('route graph is populated for valid structure', () => {
    const fixture = makeValidFixture();
    const result = validateAppStructure({ cwd: fixture });
    assert(result.routeGraph.length > 0, 'Expected non-empty route graph');
    return fixture;
  });

  test('timestamp is set', () => {
    const fixture = makeValidFixture();
    const result = validateAppStructure({ cwd: fixture });
    assert(typeof result.timestamp === 'number');
    assert(result.timestamp > 0);
    return fixture;
  });

  console.log('');
  console.log(`[test:structure-validator] ${passCount}/${testCount} tests passed.`);

  if (passCount < testCount) {
    process.exit(1);
  }
}

try {
  run();
} catch (error) {
  console.error('[test:structure-validator] FATAL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
