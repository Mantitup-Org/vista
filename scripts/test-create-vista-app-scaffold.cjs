#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'packages', 'create-vista-app', 'bin', 'cli.js');
const cliModule = require(cliPath);

async function runCreate(tempRoot, name, extraArgs = []) {
  const previousArgv = process.argv.slice();
  const previousCwd = process.cwd();

  process.chdir(tempRoot);
  process.argv = [process.execPath, cliPath, name, '--skip-install', '--no-git', '--yes', ...extraArgs];
  delete require.cache[require.resolve(cliPath)];

  try {
    const cliModule = require(cliPath);
    await cliModule.main();
  } finally {
    process.argv = previousArgv;
    process.chdir(previousCwd);
  }

  return path.join(tempRoot, name);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertCommonScripts(packageJson) {
  assert.equal(packageJson.scripts.dev, 'vista dev');
  assert.equal(packageJson.scripts.build, 'vista build');
  assert.equal(packageJson.scripts.start, 'vista start');
  assert.equal(packageJson.scripts.deploy, 'vista deploy');
  assert.equal(packageJson.devDependencies.webpack, '^5.90.0');
  assert.equal(packageJson.dependencies['lucide-react'], undefined);
}

function assertEngineOwnedScaffold(projectDir, useSrcDir = false) {
  const appRoot = useSrcDir ? path.join(projectDir, 'src', 'app') : path.join(projectDir, 'app');
  const indexSource = fs.readFileSync(path.join(appRoot, 'index.tsx'), 'utf8');
  assert(
    indexSource.includes("import { ThemeToggle } from 'vista/theme';"),
    'starter should import ThemeToggle from vista/theme'
  );
  assert.equal(fs.existsSync(path.join(projectDir, 'components')), false, 'CLI should not scaffold components/');
  assert.equal(
    fs.existsSync(path.join(projectDir, 'src', 'components')),
    false,
    'CLI should not scaffold src/components/'
  );
  assert.equal(fs.existsSync(path.join(projectDir, 'deploy')), false, 'CLI should not scaffold deploy/');
  for (const fileName of [
    'render.yaml',
    'Dockerfile',
    '.dockerignore',
    'wrangler.toml',
    'netlify.toml',
    'vercel.json',
  ]) {
    assert.equal(
      fs.existsSync(path.join(projectDir, fileName)),
      false,
      `CLI should not scaffold ${fileName}; vista deploy owns platform files`
    );
  }
}

function assertEngineConfig(projectDir, expectedVariant) {
  const configSource = fs.readFileSync(path.join(projectDir, 'vista.config.ts'), 'utf8');
  assert(
    configSource.includes(`variant: '${expectedVariant}'`),
    `vista.config.ts should set engine variant to ${expectedVariant}`
  );
}

function assertReadme(projectDir, expectedVariant, expectedTypedApiState) {
  const readme = fs.readFileSync(path.join(projectDir, 'README.md'), 'utf8');
  assert(readme.includes(`Selected engine: \`${expectedVariant}\``));
  assert(readme.includes(`Typed API starter: \`${expectedTypedApiState}\``));
}

function assertNoTemplateTokens(projectDir, useSrcDir = false) {
  const appRoot = useSrcDir ? path.join(projectDir, 'src', 'app') : path.join(projectDir, 'app');
  const rootSource = fs.readFileSync(path.join(appRoot, 'root.tsx'), 'utf8');
  const indexSource = fs.readFileSync(path.join(appRoot, 'index.tsx'), 'utf8');
  assert(!rootSource.includes('__VISTA_'), 'root.tsx should not contain unreplaced template tokens');
  assert(!indexSource.includes('__VISTA_'), 'index.tsx should not contain unreplaced template tokens');
}

function assertSrcLayout(projectDir) {
  assert(fs.existsSync(path.join(projectDir, 'src', 'app', 'root.tsx')));
  assert(fs.existsSync(path.join(projectDir, 'src', 'app', 'index.tsx')));
  assert(!fs.existsSync(path.join(projectDir, 'app')), 'root app/ should not exist with --src-dir');
  assert(
    !fs.existsSync(path.join(projectDir, 'components')),
    'root components/ should not exist with --src-dir'
  );
  const tsconfig = readJson(path.join(projectDir, 'tsconfig.json'));
  assert.deepEqual(tsconfig.compilerOptions.paths['@/*'], ['./src/*']);
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-create-app-'));

  try {
    assert.equal(cliModule.detectPackageManager('pnpm/9.6.0 npm/? node/v22.12.0'), 'pnpm');
    assert.equal(cliModule.detectPackageManager('yarn/1.22.22 npm/? node/v22.12.0'), 'yarn');
    assert.equal(cliModule.detectPackageManager('bun/1.2.0 npm/? node/v22.12.0'), 'bun');
    assert.equal(cliModule.detectPackageManager('npm/10.9.0 node/v22.12.0'), 'npm');
    assert.equal(cliModule.normalizePackageManager(' PNPM '), 'pnpm');
    assert.equal(cliModule.normalizePackageManager('unknown'), undefined);
    assert.equal(cliModule.getInstallCommand('npm'), 'npm install');
    assert.equal(cliModule.getInstallCommand('pnpm'), 'pnpm install');
    assert.equal(cliModule.getInstallCommand('yarn'), 'yarn');
    assert.equal(cliModule.getInstallCommand('bun'), 'bun install');
    assert.equal(cliModule.getRunCommand('npm'), 'npm run');
    assert.equal(cliModule.getRunCommand('pnpm'), 'pnpm');
    assert.equal(cliModule.getCreateCommand('npm'), 'npx create-vista-app@latest');
    assert.equal(cliModule.getCreateCommand('pnpm'), 'pnpm create vista-app');
    assert.equal(cliModule.getCreateCommand('yarn'), 'yarn create vista-app');
    assert.equal(cliModule.getCreateCommand('bun'), 'bun create vista-app');

    const defaultProject = await runCreate(tempRoot, 'default-app');
    const defaultPackage = readJson(path.join(defaultProject, 'package.json'));
    assertCommonScripts(defaultPackage);
    assertEngineConfig(defaultProject, 'default');
    assertReadme(defaultProject, 'default', 'disabled');
    assertNoTemplateTokens(defaultProject, false);
    assertEngineOwnedScaffold(defaultProject, false);
    const defaultGitignore = fs.readFileSync(path.join(defaultProject, '.gitignore'), 'utf8');
    assert(!defaultGitignore.includes('.next/'), 'generated .gitignore should not contain .next/');
    const defaultRoot = fs.readFileSync(path.join(defaultProject, 'app', 'root.tsx'), 'utf8');
    const defaultIndex = fs.readFileSync(path.join(defaultProject, 'app', 'index.tsx'), 'utf8');
    assert(defaultRoot.includes("from 'vista/theme'"));
    assert(defaultRoot.includes("ThemeScript defaultTheme=\"system\""));
    assert(defaultRoot.includes("ThemeProvider defaultTheme=\"system\""));
    assert(!defaultIndex.includes('blur-[120px]'), 'default starter should not include flashpack spotlight styling');
    assert(
      defaultIndex.includes("import Image from 'vista/image';"),
      'default starter should use vista/image'
    );
    assert(
      defaultIndex.includes('Start by editing') &&
        defaultIndex.includes('Stable default path') &&
        defaultIndex.includes('Config-first workflow') &&
        defaultIndex.includes('Open env guide') &&
        defaultIndex.includes('ThemeToggle'),
      'default starter should include the polished default starter sections'
    );

    const srcProject = await runCreate(tempRoot, 'src-app', ['--src-dir']);
    assertSrcLayout(srcProject);
    assertNoTemplateTokens(srcProject, true);
    assertEngineOwnedScaffold(srcProject, true);
    assertEngineConfig(srcProject, 'default');

    const flashpackProject = await runCreate(tempRoot, 'flashpack-app', ['--engine', 'flashpack', '--typed-api']);
    const flashpackPackage = readJson(path.join(flashpackProject, 'package.json'));
    assertCommonScripts(flashpackPackage);
    assertEngineConfig(flashpackProject, 'flashpack');
    assertReadme(flashpackProject, 'flashpack', 'enabled');
    assertNoTemplateTokens(flashpackProject, false);
    assertEngineOwnedScaffold(flashpackProject, false);
    const flashpackRoot = fs.readFileSync(path.join(flashpackProject, 'app', 'root.tsx'), 'utf8');
    const flashpackIndex = fs.readFileSync(path.join(flashpackProject, 'app', 'index.tsx'), 'utf8');
    assert(flashpackRoot.includes("from 'vista/theme'"));
    assert(
      flashpackRoot.includes("ThemeScript defaultTheme=\"dark\"") &&
        flashpackRoot.includes("ThemeProvider defaultTheme=\"dark\""),
      'flashpack starter should default to the dark theme flow'
    );
    assert(
      flashpackIndex.includes('blur-[110px]') &&
        flashpackIndex.includes('bg-primary') &&
        flashpackIndex.includes('dark:invert') &&
        flashpackIndex.includes('Stay in flow while the app keeps moving.'),
      'flashpack starter should include the orange spotlight accent'
    );
    assert.equal(
      (flashpackIndex.match(/min-h-\[100dvh\]/g) || []).length,
      1,
      'flashpack starter should only use one viewport-height shell to avoid unnecessary page scroll'
    );
    assert(
      flashpackIndex.includes("import Image from 'vista/image';"),
      'flashpack starter should use vista/image'
    );

    const flashpackSrcProject = await runCreate(tempRoot, 'flashpack-src-app', [
      '--engine',
      'flashpack',
      '--src-dir',
      '--typed-api',
    ]);
    assertSrcLayout(flashpackSrcProject);
    assertEngineOwnedScaffold(flashpackSrcProject, true);
    assert(fs.existsSync(path.join(flashpackSrcProject, 'src', 'app', 'api', 'typed.ts')));
    assertNoTemplateTokens(flashpackSrcProject, true);

    const pnpmProject = await runCreate(tempRoot, 'pnpm-app', ['--pnpm']);
    const pnpmPackage = readJson(path.join(pnpmProject, 'package.json'));
    assertCommonScripts(pnpmPackage);
    assertEngineConfig(pnpmProject, 'default');
    assertReadme(pnpmProject, 'default', 'disabled');

    console.log('[test:create-vista-app-scaffold] OK');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[test:create-vista-app-scaffold] FAILED');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
