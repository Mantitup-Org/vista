#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const prompts = require('prompts');

const usageCommand = 'npx create-vista-app@latest <project-name>';
const SUPPORTED_PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

// Detect which package manager invoked us (npm, pnpm, yarn, bun)
function normalizePackageManager(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SUPPORTED_PACKAGE_MANAGERS.includes(normalized) ? normalized : undefined;
}

function detectPackageManager(userAgent = process.env.npm_config_user_agent || '') {
  const ua = String(userAgent || '');
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';
  return 'npm';
}

function getExplicitPackageManagerFromArgs(args) {
  const explicitValue = normalizePackageManager(getFlagValue('--package-manager'));
  const explicitFlags = SUPPORTED_PACKAGE_MANAGERS.filter((manager) => args.includes(`--${manager}`));

  if (explicitFlags.length > 1) {
    console.error('Error: use only one package manager flag: --npm, --pnpm, --yarn, or --bun.');
    process.exit(1);
  }

  if (getFlagValue('--package-manager') && !explicitValue) {
    console.error(
      `Error: unsupported package manager "${getFlagValue('--package-manager')}". Use npm, pnpm, yarn, or bun.`
    );
    process.exit(1);
  }

  if (explicitValue && explicitFlags.length > 0 && explicitFlags[0] !== explicitValue) {
    console.error('Error: package manager flags conflict. Use only one package manager selector.');
    process.exit(1);
  }

  return explicitValue || explicitFlags[0];
}

const rawArgs = process.argv.slice(2);
const useTypedApiStarter = rawArgs.includes('--typed-api') || rawArgs.includes('--typed');
const skipInstall = rawArgs.includes('--skip-install');
const skipGit = rawArgs.includes('--no-git');
const includeDeployTemplates = !rawArgs.includes('--no-deploy-templates');
const assumeYes = rawArgs.includes('--yes') || rawArgs.includes('-y');
const canPrompt = !!(process.stdin.isTTY && process.stdout.isTTY);
const detectedPackageManager = detectPackageManager();

function getFlagValue(flag) {
  const index = rawArgs.indexOf(flag);
  if (index !== -1) {
    const next = rawArgs[index + 1];
    if (next && !next.startsWith('-')) return next;
  }
  const inline = rawArgs.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  return undefined;
}

const explicitFlashpack = rawArgs.includes('--flashpack');
const explicitDefaultEngine = rawArgs.includes('--default-engine');
const explicitEngine = getFlagValue('--engine');
const explicitPackageManager = getExplicitPackageManagerFromArgs(rawArgs);
const explicitSrcDir =
  rawArgs.includes('--src-dir') || rawArgs.includes('--src')
    ? true
    : rawArgs.includes('--no-src-dir')
      ? false
      : undefined;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage:
  ${usageCommand} [--typed-api] [--skip-install] [--no-git] [--yes] [--no-deploy-templates] [--engine <default|flashpack>] [--flashpack] [--default-engine] [--src-dir|--no-src-dir] [--package-manager <npm|pnpm|yarn|bun>] [--npm|--pnpm|--yarn|--bun]

Example:
  npx create-vista-app@latest my-vista-app
  npx create-vista-app@latest
  npx create-vista-app@latest my-vista-app --typed-api
  npx create-vista-app@latest my-vista-app --flashpack
  npx create-vista-app@latest my-vista-app --src-dir
  npx create-vista-app@latest my-vista-app --package-manager pnpm
`);
  process.exit(0);
}

if (explicitFlashpack && explicitDefaultEngine) {
  console.error('Error: use only one of --flashpack or --default-engine.');
  process.exit(1);
}

if (rawArgs.includes('--src-dir') && rawArgs.includes('--no-src-dir')) {
  console.error('Error: use only one of --src-dir or --no-src-dir.');
  process.exit(1);
}

if (rawArgs.includes('--src') && rawArgs.includes('--no-src-dir')) {
  console.error('Error: use only one of --src / --src-dir or --no-src-dir.');
  process.exit(1);
}

if (explicitEngine && !['default', 'flashpack'].includes(explicitEngine)) {
  console.error(`Error: unsupported engine "${explicitEngine}". Use "default" or "flashpack".`);
  process.exit(1);
}

async function resolveProjectName() {
  const args = rawArgs.filter((arg) => !arg.startsWith('-'));
  if (args[0]) return args[0];

  if (!canPrompt) {
    return 'my-vista-app';
  }

  const response = await prompts({
    type: 'text',
    name: 'projectName',
    message: 'Project name?',
    initial: 'my-vista-app',
    validate: (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return 'Project name is required.';
      if (/[<>:"/\\|?*\x00-\x1F]/.test(trimmed)) return 'Use a valid folder name.';
      return true;
    },
  });

  const value = String(response.projectName || '').trim();
  if (!value) {
    console.log('Aborted.');
    process.exit(0);
  }
  return value;
}
async function confirmProceed(projectName, projectDir, engine, packageManager, useSrcDir) {
  if (assumeYes || !canPrompt) return true;
  const layout = useSrcDir ? 'src/app' : 'app';
  const response = await prompts({
    type: 'confirm',
    name: 'proceed',
    message: `Create Vista app "${projectName}" in ${projectDir} (engine: ${engine}, layout: ${layout}, package manager: ${packageManager})?`,
    initial: true,
  });
  return response.proceed !== false;
}

async function resolveEngineChoice() {
  if (explicitEngine) return explicitEngine;
  if (explicitFlashpack) return 'flashpack';
  if (explicitDefaultEngine) return 'default';
  if (assumeYes || !canPrompt) return 'default';

  const response = await prompts({
    type: 'select',
    name: 'engine',
    message: 'Select engine',
    choices: [
      {
        title: 'default (recommended)',
        value: 'default',
        description: 'Stable webpack-first path',
      },
      {
        title: 'flashpack',
        value: 'flashpack',
        description: 'Rust-first engine path',
      },
    ],
    initial: 0,
  });

  const value = String(response.engine || '').trim();
  if (!value) {
    console.log('Aborted.');
    process.exit(0);
  }
  return value;
}

async function resolveSrcDirChoice() {
  if (typeof explicitSrcDir === 'boolean') return explicitSrcDir;
  if (assumeYes || !canPrompt) return false;

  const response = await prompts({
    type: 'confirm',
    name: 'useSrcDir',
    message: 'Would you like to use a `src/` directory?',
    initial: false,
  });

  if (typeof response.useSrcDir !== 'boolean') {
    console.log('Aborted.');
    process.exit(0);
  }

  return response.useSrcDir;
}

async function resolvePackageManagerChoice() {
  if (explicitPackageManager) return explicitPackageManager;
  if (assumeYes || !canPrompt) return detectedPackageManager;

  const response = await prompts({
    type: 'select',
    name: 'packageManager',
    message: 'Select package manager',
    choices: [
      {
        title: 'npm',
        value: 'npm',
        description: 'Widely available default',
      },
      {
        title: 'pnpm',
        value: 'pnpm',
        description: 'Fast installs with shared store',
      },
      {
        title: 'yarn',
        value: 'yarn',
        description: 'Classic Yarn workflow',
      },
      {
        title: 'bun',
        value: 'bun',
        description: 'Fast Bun-based install/runtime',
      },
    ],
    initial: Math.max(SUPPORTED_PACKAGE_MANAGERS.indexOf(detectedPackageManager), 0),
  });

  const value = normalizePackageManager(response.packageManager);
  if (!value) {
    console.log('Aborted.');
    process.exit(0);
  }

  return value;
}

function getInstallCommand(packageManager) {
  if (packageManager === 'yarn') return 'yarn';
  if (packageManager === 'bun') return 'bun install';
  return `${packageManager} install`;
}

function getRunCommand(packageManager) {
  return packageManager === 'npm' ? 'npm run' : packageManager;
}

function getCreateCommand(packageManager) {
  if (packageManager === 'pnpm') return 'pnpm create vista-app';
  if (packageManager === 'yarn') return 'yarn create vista-app';
  if (packageManager === 'bun') return 'bun create vista-app';
  return 'npx create-vista-app@latest';
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function injectEngineBlock(source, selectedEngine) {
  // Prefer preserving existing formatting when an engine block already exists.
  if (/\bengine\s*:\s*\{[\s\S]*?\bvariant\s*:\s*['"][^'"]+['"]/m.test(source)) {
    return source.replace(
      /(\bengine\s*:\s*\{[\s\S]*?\bvariant\s*:\s*['"])([^'"]+)(['"])/m,
      `$1${selectedEngine}$3`
    );
  }

  // Replace existing scalar engine config
  if (/\bengine\s*:\s*['"][^'"]+['"],?/m.test(source)) {
    return source.replace(/\bengine\s*:\s*['"][^'"]+['"],?/m, `engine: '${selectedEngine}',`);
  }

  // Insert right after "const config = {"
  const engineBlock = `  engine: {\n    variant: '${selectedEngine}',\n  },`;
  const marker = 'const config = {';
  const markerIndex = source.indexOf(marker);
  if (markerIndex !== -1) {
    const insertAt = markerIndex + marker.length;
    return `${source.slice(0, insertAt)}\n${engineBlock}${source.slice(insertAt)}`;
  }

  // Fallback to a minimal config when template structure is unexpected
  return `const config = {\n${engineBlock}\n};\n\nexport default config;\n`;
}

function applyEngineToVistaConfig(projectDir, selectedEngine) {
  const configPath = path.join(projectDir, 'vista.config.ts');
  if (!fs.existsSync(configPath)) return;

  const source = fs.readFileSync(configPath, 'utf8');
  const patched = injectEngineBlock(source, selectedEngine);
  fs.writeFileSync(configPath, patched);
}

function applyReadmeSelections(projectDir, selectedEngine, useTypedApi, useSrcDir = false) {
  const readmePath = path.join(projectDir, 'README.md');
  if (!fs.existsSync(readmePath)) return;

  let source = fs.readFileSync(readmePath, 'utf8');
  source = source
    .replace(/__VISTA_ENGINE__/g, selectedEngine)
    .replace(/__VISTA_TYPED_API__/g, useTypedApi ? 'enabled' : 'disabled');

  if (useSrcDir) {
    source = source
      .replace(/Add pages under `app`\./g, 'Add pages under `src/app`.')
      .replace(/`app\/api\/\*\*\/route\.ts`/g, '`src/app/api/**/route.ts`')
      .replace(/`app\/agents\//g, '`src/app/agents/')
      .replace(
        /```\napp\/\n├── root\.tsx[\s\S]*?vista\.config\.ts\n```/,
        '```\nsrc/\n├── app/\n│   ├── root.tsx        # Root layout\n│   ├── index.tsx       # Home → /\n│   ├── globals.css\n│   └── about/page.tsx  # → /about\n└── components/\npublic/\nvista.config.ts\n```'
      );
  }

  fs.writeFileSync(readmePath, source);
}

function applyFlashpackStarterTheme(projectDir) {
  const flashTemplateDir = path.join(__dirname, 'flash-template');
  if (fs.existsSync(flashTemplateDir)) {
    copyRecursiveSync(flashTemplateDir, projectDir);
  }
}

/**
 * Move app/ + components/ under src/ (Next-style layout).
 * Call after all template overlays so flashpack/typed files move too.
 */
function applySrcDirectoryLayout(projectDir) {
  const srcDir = path.join(projectDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const moves = [
    ['app', path.join('src', 'app')],
    ['components', path.join('src', 'components')],
  ];

  for (const [fromRel, toRel] of moves) {
    const from = path.join(projectDir, fromRel);
    const to = path.join(projectDir, toRel);
    if (!fs.existsSync(from)) continue;
    if (fs.existsSync(to)) {
      // Merge: move children into existing target
      for (const entry of fs.readdirSync(from)) {
        const srcPath = path.join(from, entry);
        const destPath = path.join(to, entry);
        if (fs.existsSync(destPath)) {
          fs.rmSync(destPath, { recursive: true, force: true });
        }
        fs.renameSync(srcPath, destPath);
      }
      fs.rmSync(from, { recursive: true, force: true });
    } else {
      fs.renameSync(from, to);
    }
  }

  // Point @/* at src/* for the common import alias.
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      tsconfig.compilerOptions = tsconfig.compilerOptions || {};
      tsconfig.compilerOptions.paths = {
        ...(tsconfig.compilerOptions.paths || {}),
        '@/*': ['./src/*'],
      };
      fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
    } catch {
      // Keep scaffold resilient if tsconfig is unexpected.
    }
  }
}

function applyDeployTemplates(projectDir, options = {}) {
  const deployTemplateDir = path.join(__dirname, '../template/deploy');
  if (!fs.existsSync(deployTemplateDir)) return;

  const includeAll = Boolean(options.all);
  const defaultFiles = ['render.yaml', 'Dockerfile', '.dockerignore'];
  const optionalFiles = ['wrangler.toml', 'netlify.toml', 'vercel.json'];
  const filesToCopy = includeAll ? [...defaultFiles, ...optionalFiles] : defaultFiles;

  for (const fileName of filesToCopy) {
    const source = path.join(deployTemplateDir, fileName);
    const target = path.join(projectDir, fileName);
    if (fs.existsSync(source) && !fs.existsSync(target)) {
      fs.copyFileSync(source, target);
    }
  }
}

async function main() {
  const useLocal = rawArgs.includes('--local');
  const currentDir = process.cwd();
  const projectName = await resolveProjectName();
  const selectedEngine = await resolveEngineChoice();
  const useSrcDir = await resolveSrcDirChoice();
  const selectedPackageManager = await resolvePackageManagerChoice();
  const projectDir = path.join(currentDir, projectName);

  const proceed = await confirmProceed(
    projectName,
    projectDir,
    selectedEngine,
    selectedPackageManager,
    useSrcDir
  );
  if (!proceed) {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log(`Creating a new Vista app in ${projectDir}...`);

  // 1. Create Directory
  if (fs.existsSync(projectDir)) {
    console.error(`Error: Directory ${projectName} already exists.`);
    process.exit(1);
  }
  fs.mkdirSync(projectDir);

  // 2. Copy Template
  const templateDir = path.join(__dirname, '../template');
  copyRecursiveSync(templateDir, projectDir);

  if (useTypedApiStarter) {
    const typedTemplateDir = path.join(__dirname, '../template-typed');
    copyRecursiveSync(typedTemplateDir, projectDir);
    console.log('Added typed API starter files.');
  }

  applyEngineToVistaConfig(projectDir, selectedEngine);
  applyReadmeSelections(projectDir, selectedEngine, useTypedApiStarter, useSrcDir);
  if (selectedEngine === 'flashpack') {
    applyFlashpackStarterTheme(projectDir);
  }
  if (includeDeployTemplates) {
    applyDeployTemplates(projectDir, { all: rawArgs.includes('--deploy-templates-all') });
    console.log('Added deployment templates (render.yaml, Dockerfile).');
  }

  if (useSrcDir) {
    applySrcDirectoryLayout(projectDir);
    console.log('Using src/ directory layout (src/app, src/components).');
  }

  console.log('Scaffolding complete.');

  // 3. Setup Dependencies (production-ready)
  const packageJson = {
    name: projectName,
    version: '0.1.0',
    scripts: {
      dev: 'vista dev',
      build: 'vista build',
      start: 'vista start',
      deploy: 'vista deploy',
    },
    dependencies: {
      // Runtime dependencies
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      'react-server-dom-webpack': '^19.0.0',
      vista: useLocal ? 'file:../packages/vista' : 'npm:@vistagenic/vista@0.3.3',
      'lucide-react': '^0.468.0',
      // CSS build (needed in production for vista build)
      postcss: '^8.0.0',
      tailwindcss: '^4.0.0',
      '@tailwindcss/postcss': '^4.0.0',
      '@swc-node/register': '^1.9.0',
      '@swc/core': '^1.4.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      webpack: '^5.90.0',
      'postcss-cli': '^11.0.0',
      tsx: '^4.7.0',
    },
  };

  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  // 4. Create .gitignore
  const gitignoreContent = `# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
.vista/
.flash/
out/

# Rust artifacts
target/
*.node

# IDE
.idea/
.vscode/
*.swp
*.swo

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# OS files
.DS_Store
Thumbs.db

# TypeScript
*.tsbuildinfo

# Testing
coverage/

# Misc
*.log
`;

  fs.writeFileSync(path.join(projectDir, '.gitignore'), gitignoreContent);

  console.log('Created .gitignore');

  // 5. Initialize Git Repository
  if (!skipGit) {
    try {
      execSync('git init', { cwd: projectDir, stdio: 'pipe' });
      execSync('git add .', { cwd: projectDir, stdio: 'pipe' });
      execSync('git commit -m "Initial commit from create-vista-app"', {
        cwd: projectDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Vista',
          GIT_AUTHOR_EMAIL: 'vista@example.com',
          GIT_COMMITTER_NAME: 'Vista',
          GIT_COMMITTER_EMAIL: 'vista@example.com',
        },
      });
      console.log('Initialized git repository with initial commit');
    } catch (e) {
      // Git might not be installed, that's okay
      console.log('Note: Could not initialize git repository. You can do this manually with: git init');
    }
  } else {
    console.log('Skipped git initialization (--no-git).');
  }

  // 6. Install Dependencies
  const installCmd = getInstallCommand(selectedPackageManager);
  if (!skipInstall) {
    console.log(
      `\nInstalling dependencies with ${selectedPackageManager}... This may take a moment.\n`
    );
    try {
      execSync(installCmd, { cwd: projectDir, stdio: 'inherit' });
      console.log(`\n✓ Dependencies installed successfully!`);
    } catch (e) {
      console.log(
        `\nNote: Could not install dependencies automatically. Run "${installCmd}" manually.`
      );
    }
  } else {
    console.log('\nSkipped dependency installation (--skip-install).');
  }

  const runCmd = getRunCommand(selectedPackageManager);
  const createCmd = getCreateCommand(selectedPackageManager);

  console.log(`
✨ Success! Created ${projectName} at ${projectDir}
Engine: ${selectedEngine}
Layout: ${useSrcDir ? 'src/app' : 'app'}
Package manager: ${selectedPackageManager}

Get started by running:

  cd ${projectName}
  ${runCmd} dev

Create another app anytime with:
  ${createCmd} <project-name>

Happy Hacking! 🚀
`);
}

module.exports = {
  main,
  detectPackageManager,
  normalizePackageManager,
  getInstallCommand,
  getRunCommand,
  getCreateCommand,
  injectEngineBlock,
  applyEngineToVistaConfig,
  applyReadmeSelections,
  applyFlashpackStarterTheme,
  applySrcDirectoryLayout,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('create-vista-app failed:', error);
    process.exit(1);
  });
}
