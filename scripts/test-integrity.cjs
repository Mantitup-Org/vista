#!/usr/bin/env node
/**
 * Vista Integrity Guard — CI Test (Layer 4)
 *
 * Verifies that all naming layers (TS, Rust, Config, Tests) are in sync.
 * Run this in CI to catch accidental renaming or tampering.
 *
 * Usage: node scripts/test-integrity.cjs
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const vistaSrcRoot = path.join(repoRoot, 'packages', 'vista', 'src');
const napiRoot = path.join(repoRoot, 'crates', 'vista-napi');
const rootPackageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

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

console.log('\n\x1b[1;35m━━━ Vista Integrity Guard ━━━\x1b[0m\n');

// ============================================================================
// 1. TS constants.ts contains required values
// ============================================================================

console.log('\x1b[1m[Layer 1] TypeScript Constants\x1b[0m');

const constantsSource = fs.readFileSync(path.join(vistaSrcRoot, 'constants.ts'), 'utf8');

test('FRAMEWORK_NAME defined', () => {
  assert(constantsSource.includes("FRAMEWORK_NAME = 'vista'"), 'Missing FRAMEWORK_NAME');
});

test('BUILD_DIR defined', () => {
  assert(constantsSource.includes("BUILD_DIR = '.vista'"), 'Missing BUILD_DIR');
});

test('URL_PREFIX defined', () => {
  assert(constantsSource.includes("URL_PREFIX = '/_vista'"), 'Missing URL_PREFIX');
});

test('SSE_ENDPOINT defined', () => {
  assert(constantsSource.includes("SSE_ENDPOINT = '/__vista_reload'"), 'Missing SSE_ENDPOINT');
});

// ============================================================================
// 2. Rust naming.rs mirrors TS constants
// ============================================================================

console.log('\n\x1b[1m[Layer 2] Rust naming.rs Sync\x1b[0m');

const namingRsPath = path.join(repoRoot, 'crates', 'vista-transforms', 'src', 'naming.rs');
const namingRsSource = fs.readFileSync(namingRsPath, 'utf8');

test('Rust FRAMEWORK_NAME = "vista"', () => {
  assert(namingRsSource.includes('FRAMEWORK_NAME: &str = "vista"'), 'Rust FRAMEWORK_NAME mismatch');
});

test('Rust URL_PREFIX = "/_vista"', () => {
  assert(namingRsSource.includes('URL_PREFIX: &str = "/_vista"'), 'Rust URL_PREFIX mismatch');
});

test('Rust BUILD_DIR = ".vista"', () => {
  assert(namingRsSource.includes('BUILD_DIR: &str = ".vista"'), 'Rust BUILD_DIR mismatch');
});

test('Rust MOUNT_ID_PREFIX = "__vista_cc_"', () => {
  assert(
    namingRsSource.includes('MOUNT_ID_PREFIX: &str = "__vista_cc_"'),
    'Rust MOUNT_ID_PREFIX mismatch'
  );
});

test('Rust compute_integrity_token() exists', () => {
  assert(namingRsSource.includes('fn compute_integrity_token'), 'Missing integrity token function');
});

// ============================================================================
// 3. NAPI exports identity functions
// ============================================================================

console.log('\n\x1b[1m[Layer 3] NAPI Binary Bridge\x1b[0m');

const napiIndexSource = fs.readFileSync(path.join(napiRoot, 'index.js'), 'utf8');

test('NAPI exports getFrameworkIdentity', () => {
  assert(napiIndexSource.includes('getFrameworkIdentity'), 'Missing getFrameworkIdentity export');
});

test('NAPI exports verifyIntegrity', () => {
  assert(napiIndexSource.includes('verifyIntegrity'), 'Missing verifyIntegrity export');
});

test('NAPI binary uses "vista-native" naming', () => {
  assert(
    napiIndexSource.includes('vista-native.'),
    'Binary naming changed — breaks platform loading'
  );
});

// ============================================================================
// 4. No inline hardcoded vista naming in TS source (must use constants)
// ============================================================================

console.log('\n\x1b[1m[Layer 4] No Inline Hardcoded Naming\x1b[0m');

const filesToCheck = [
  'server/engine.ts',
  'build/rsc/compiler.ts',
  'build/rsc/client-manifest.ts',
  'build/manifest.ts',
  'server/logger.ts',
  'image/image-loader.ts',
  'image/image-config.ts',
  'bin/build.ts',
  'bin/build-rsc.ts',
];

// Patterns that should NOT appear outside constants.ts
const forbiddenPatterns = [
  { regex: /['"]\/\__vista_reload['"]/g, label: '/__vista_reload' },
  { regex: /['"]\/\_vista\/image['"]/g, label: '/_vista/image' },
  { regex: /['"]\._vista['"]/g, label: '.vista (as string)' },
];

for (const file of filesToCheck) {
  const fullPath = path.join(vistaSrcRoot, file);
  if (!fs.existsSync(fullPath)) continue;

  const source = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of forbiddenPatterns) {
    test(`${file} does not hardcode ${pattern.label}`, () => {
      const matches = source.match(pattern.regex);
      assert(
        !matches,
        `Found inline hardcoded "${pattern.label}" in ${file} — use constants.ts instead`
      );
    });
  }
}

// ============================================================================
// 5. Config files reference correct BUILD_DIR
// ============================================================================

console.log('\n\x1b[1m[Layer 5] Config File Sync\x1b[0m');

test('.gitignore has .vista/', () => {
  const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
  assert(gitignore.includes('.vista/'), '.gitignore missing .vista/');
});

test('flashrepo.json has .vista/**', () => {
  const flashrepo = fs.readFileSync(path.join(repoRoot, 'flashrepo.json'), 'utf8');
  assert(flashrepo.includes('.vista/**'), 'flashrepo.json missing .vista/**');
});

test('eslint.config.mjs ignores .vista', () => {
  const eslint = fs.readFileSync(path.join(repoRoot, 'eslint.config.mjs'), 'utf8');
  assert(eslint.includes('.vista'), 'eslint.config.mjs missing .vista ignore');
});

test('package.json has bin.vista', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'packages', 'vista', 'package.json'), 'utf8')
  );
  assert(pkg.bin && pkg.bin.vista, 'Missing bin.vista command');
  assert(pkg.exports && pkg.exports['./server'], 'Missing ./server export in vista package');
  assert(pkg.exports && pkg.exports['./cache'], 'Missing ./cache export in vista package');
  assert(pkg.exports && pkg.exports['./ai'], 'Missing ./ai export in vista package');
  assert(
    pkg.exports && pkg.exports['./server/runtime-actions'],
    'Missing ./server/runtime-actions export in vista package'
  );
});

// ============================================================================
// 6. integrity.ts exists and has required functions
// ============================================================================

console.log('\n\x1b[1m[Layer 6] Integrity Module\x1b[0m');

const integritySource = fs.readFileSync(path.join(vistaSrcRoot, 'integrity.ts'), 'utf8');

test('integrity.ts has verifyFrameworkIntegrity', () => {
  assert(integritySource.includes('verifyFrameworkIntegrity'), 'Missing verifyFrameworkIntegrity');
});

test('integrity.ts has generateBuildWatermark', () => {
  assert(integritySource.includes('generateBuildWatermark'), 'Missing generateBuildWatermark');
});

test('integrity.ts has computeJSIntegrityToken', () => {
  assert(integritySource.includes('computeJSIntegrityToken'), 'Missing computeJSIntegrityToken');
});

// ============================================================================
// 7. Build watermark is embedded in artifact manifest
// ============================================================================

console.log('\n\x1b[1m[Layer 7] Build Watermark\x1b[0m');

const manifestSource = fs.readFileSync(path.join(vistaSrcRoot, 'build', 'manifest.ts'), 'utf8');

test('manifest.ts imports generateBuildWatermark', () => {
  assert(manifestSource.includes('generateBuildWatermark'), 'Missing watermark import');
});

test('manifest.ts embeds __integrity in artifact manifest', () => {
  assert(manifestSource.includes('__integrity'), 'Missing __integrity in artifact manifest');
});

// ============================================================================
// 8. Flashpack architecture scaffold exists and is wired
// ============================================================================

console.log('\n\x1b[1m[Layer 8] Flashpack Scaffold\x1b[0m');

const cargoToml = fs.readFileSync(path.join(repoRoot, 'Cargo.toml'), 'utf8');

const requiredFlashpackPaths = [
  'flashpack/crates/flashpack',
  'flashpack/crates/flashpack-analyze',
  'flashpack/crates/flashpack-core',
  'flashpack/crates/flashpack-cli-utils',
  'flashpack/crates/flashpack-create-test-app',
  'flashpack/crates/flashpack-dev-server',
  'flashpack/crates/flashpack-ecmascript-hmr-protocol',
  'flashpack/crates/flashpack-ecmascript-runtime',
  'flashpack/crates/flashpack-image',
  'flashpack/crates/flashpack-node',
  'flashpack/crates/flashpack-static',
  'flashpack/crates/flashpack-tracing',
  'flashpack/crates/flashpack-resolve',
  'flashpack/crates/README.md',
  'flashpack/xtask',
];

for (const relPath of requiredFlashpackPaths) {
  test(`Scaffold path exists: ${relPath}`, () => {
    assert(fs.existsSync(path.join(repoRoot, relPath)), `Missing ${relPath}`);
  });
}

test('Workspace members include flashpack crates glob', () => {
  assert(
    cargoToml.includes('"flashpack/crates/*"'),
    'Cargo workspace must include flashpack/crates/*'
  );
});

test('Workspace members include flashpack xtask', () => {
  assert(cargoToml.includes('"flashpack/xtask"'), 'Cargo workspace must include flashpack/xtask');
});

test('Workspace excludes standalone Vista error-code plugin crate', () => {
  assert(
    cargoToml.includes('"crates/vista-error-code-swc-plugin"'),
    'Cargo workspace should declare the standalone Vista error-code plugin exclusion'
  );
});

test('Vista error-code plugin crate exists', () => {
  assert(
    fs.existsSync(path.join(repoRoot, 'crates', 'vista-error-code-swc-plugin')),
    'Missing crates/vista-error-code-swc-plugin'
  );
});

test('Flashpack README reflects Rust CLI orchestration', () => {
  const flashpackReadme = fs.readFileSync(path.join(repoRoot, 'flashpack', 'README.md'), 'utf8');
  assert(
    flashpackReadme.includes('flashpack-cli'),
    'flashpack/README.md must describe flashpack-cli orchestration'
  );
});

// ============================================================================
// 9. Engine Selection Wiring
// ============================================================================

console.log('\n\x1b[1m[Layer 9] Engine Selection Wiring\x1b[0m');

const vistaBinSource = fs.readFileSync(
  path.join(repoRoot, 'packages', 'vista', 'bin', 'vista.js'),
  'utf8'
);
const createVistaAppSource = fs.readFileSync(
  path.join(repoRoot, 'packages', 'create-vista-app', 'bin', 'cli.js'),
  'utf8'
);
const vistaConfigSource = fs.readFileSync(path.join(vistaSrcRoot, 'config.ts'), 'utf8');

test('Vista CLI supports --engine flag', () => {
  assert(vistaBinSource.includes('--engine <default|flashpack>'), 'vista CLI missing --engine option');
});

test('Vista CLI resolves config-driven engine', () => {
  assert(vistaBinSource.includes('const { loadConfig } = require(\'../dist/config\')'), 'vista CLI must read project config for engine');
});

test('create-vista-app supports --engine flag', () => {
  assert(createVistaAppSource.includes('--engine <default|flashpack>'), 'create-vista-app missing --engine option');
});

test('create-vista-app writes engine block to vista.config.ts', () => {
  assert(
    createVistaAppSource.includes('applyEngineToVistaConfig'),
    'create-vista-app must persist selected engine in vista.config.ts'
  );
});

test('Runtime config exports resolveAndApplyEngineVariant', () => {
  assert(
    vistaConfigSource.includes('resolveAndApplyEngineVariant'),
    'config.ts must expose resolveAndApplyEngineVariant'
  );
});

test('Root repo scripts use flash-run wrapper', () => {
  assert(
    String(rootPackageJson.scripts?.build || '').includes('scripts/flash-run.cjs'),
    'root build script must route through scripts/flash-run.cjs'
  );
});

test('Repo task cache avoids legacy-named .flash folders', () => {
  const flashRunnerSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'flash-run.cjs'), 'utf8');
  assert(!flashRunnerSource.includes('.flash/turbo'), 'flash-run must not write .flash/turbo');
  assert(
    !flashRunnerSource.includes('.flash/cache/turbo'),
    'flash-run must not write .flash/cache/turbo'
  );
});

test('Flash runner script exists', () => {
  assert(
    fs.existsSync(path.join(repoRoot, 'scripts', 'flash-run.cjs')),
    'Missing scripts/flash-run.cjs wrapper'
  );
});

test('flashrepo.json exists', () => {
  assert(fs.existsSync(path.join(repoRoot, 'flashrepo.json')), 'Missing flashrepo.json');
});

test('Root package.json does not depend on turbo', () => {
  assert(!rootPackageJson.devDependencies?.turbo, 'package.json should not depend on turbo');
});

test('Flashpack wrapper build file exists', () => {
  assert(
    fs.existsSync(path.join(repoRoot, 'packages', 'vista', 'src', 'bin', 'build-rsc-flashpack.ts')),
    'Missing flashpack build wrapper'
  );
});

test('Flashpack wrapper server file exists', () => {
  assert(
    fs.existsSync(
      path.join(repoRoot, 'packages', 'vista', 'src', 'server', 'rsc-engine-flashpack.ts')
    ),
    'Missing flashpack server wrapper'
  );
});

test('Flashpack command runner file exists', () => {
  assert(
    fs.existsSync(path.join(repoRoot, 'packages', 'vista', 'src', 'flashpack', 'command.ts')),
    'Missing flashpack command runner'
  );
});

test('Flashpack bin runner file exists', () => {
  assert(
    fs.existsSync(path.join(repoRoot, 'packages', 'vista', 'src', 'bin', 'flashpack-runner.ts')),
    'Missing flashpack bin runner'
  );
});

test('Runtime platform gate script exists', () => {
  assert(
    fs.existsSync(path.join(repoRoot, 'scripts', 'test-runtime-platform-gate.cjs')),
    'Missing scripts/test-runtime-platform-gate.cjs'
  );
});

test('Runtime platform gate workflow exists', () => {
  assert(
    fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'runtime-platform-gate.yml')),
    'Missing .github/workflows/runtime-platform-gate.yml'
  );
});

test('Root package.json exposes runtime platform gate', () => {
  assert(
    String(rootPackageJson.scripts?.['test:runtime:platform-gate'] || '').includes(
      'scripts/test-runtime-platform-gate.cjs'
    ),
    'package.json must expose test:runtime:platform-gate'
  );
});

// ============================================================================
// 10. Rust crate module surface is split beyond lib.rs
// ============================================================================

console.log('\n\x1b[1m[Layer 10] Rust Crate Surface\x1b[0m');

const requiredRustModulePaths = [
  'crates/vista-core/src/config.rs',
  'crates/vista-core/src/engine.rs',
  'crates/vista-core/src/manifest.rs',
  'crates/vista-core/src/platform.rs',
  'crates/vista-core/src/route.rs',
  'crates/vista-api/src/analyze.rs',
  'crates/vista-api/src/project.rs',
  'crates/vista-api/src/server_actions.rs',
  'crates/vista-build/src/pipeline.rs',
  'crates/vista-build/src/standalone.rs',
  'crates/vista-taskless/src/runtime.rs',
  'crates/vista-build-test/src/fixtures.rs',
  'crates/vista-wasm/src/bindings.rs',
  'crates/vista-transforms/src/chain_transforms.rs',
  'crates/vista-transforms/src/linter.rs',
  'crates/vista-transforms/src/react_compiler.rs',
  'crates/vista-transforms/src/transforms/mod.rs',
];

for (const relPath of requiredRustModulePaths) {
  test(`Rust module exists: ${relPath}`, () => {
    assert(fs.existsSync(path.join(repoRoot, relPath)), `Missing ${relPath}`);
  });
}

// ============================================================================
// Results
// ============================================================================

console.log('\n\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
console.log(
  `  \x1b[32m${passCount} passed\x1b[0m${failCount > 0 ? `, \x1b[31m${failCount} failed\x1b[0m` : ''}`
);

if (failCount > 0) {
  console.log('\n\x1b[31mIntegrity violations:\x1b[0m');
  for (const f of failures) {
    console.log(`  ✗ ${f.label}: ${f.err.message || f.err}`);
  }
  console.log('');
  process.exit(1);
} else {
  console.log('\n\x1b[32m[test:integrity] ALL PASSED ✓ — Framework naming is intact.\x1b[0m\n');
}
