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
  assert.equal(packageJson.dependencies.webpack, '^5.90.0');
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
  assert(readme.includes(`Selected engine for this app: \`${expectedVariant}\``));
  assert(readme.includes(`Typed API starter: \`${expectedTypedApiState}\``));
}

function assertNoTemplateTokens(projectDir) {
  const rootSource = fs.readFileSync(path.join(projectDir, 'app', 'root.tsx'), 'utf8');
  const indexSource = fs.readFileSync(path.join(projectDir, 'app', 'index.tsx'), 'utf8');
  assert(!rootSource.includes('__VISTA_'), 'root.tsx should not contain unreplaced template tokens');
  assert(!indexSource.includes('__VISTA_'), 'index.tsx should not contain unreplaced template tokens');
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
    assertNoTemplateTokens(defaultProject);
    const defaultGitignore = fs.readFileSync(path.join(defaultProject, '.gitignore'), 'utf8');
    assert(!defaultGitignore.includes('.next/'), 'generated .gitignore should not contain .next/');
    const defaultIndex = fs.readFileSync(path.join(defaultProject, 'app', 'index.tsx'), 'utf8');
    assert(!defaultIndex.includes('blur-[120px]'), 'default starter should not include flashpack spotlight styling');
    assert(
      defaultIndex.includes("import Image from 'vista/image';"),
      'default starter should use vista/image'
    );
    assert(
      defaultIndex.includes('Start by editing') &&
        defaultIndex.includes('Stable default path') &&
        defaultIndex.includes('Config-first workflow') &&
        defaultIndex.includes('Open env guide'),
      'default starter should include the polished default starter sections'
    );

    const flashpackProject = await runCreate(tempRoot, 'flashpack-app', ['--engine', 'flashpack', '--typed-api']);
    const flashpackPackage = readJson(path.join(flashpackProject, 'package.json'));
    assertCommonScripts(flashpackPackage);
    assertEngineConfig(flashpackProject, 'flashpack');
    assertReadme(flashpackProject, 'flashpack', 'enabled');
    assertNoTemplateTokens(flashpackProject);
    const flashpackRoot = fs.readFileSync(path.join(flashpackProject, 'app', 'root.tsx'), 'utf8');
    const flashpackIndex = fs.readFileSync(path.join(flashpackProject, 'app', 'index.tsx'), 'utf8');
    assert(
      flashpackRoot.includes(
        'className={`${geistSans.variable} ${geistMono.variable} min-h-screen overflow-x-hidden bg-black text-zinc-100 antialiased`}'
      ),
      'flashpack starter should inherit the dark body shell'
    );
    assert(
      flashpackIndex.includes('blur-[110px]') &&
        flashpackIndex.includes('bg-primary') &&
        flashpackIndex.includes('invert opacity-95') &&
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
