#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const vistaBin = path.join(repoRoot, 'packages', 'vista', 'bin', 'vista.js');
const fixtureRoot = path.join(repoRoot, 'bench', 'app-router-server');
const tempRoot = path.join(repoRoot, '.tmp', 'test-vista-deploy');

const EXCLUDED_DIRECTORIES = new Set(['.git', '.vista', '.flash', 'node_modules']);

function log(message) {
  console.log(`[test:vista-deploy] ${message}`);
}

function copyFixture(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      copyFixture(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const sourceFile = path.join(sourceDir, entry.name);
    const targetFile = path.join(targetDir, entry.name);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
  }
}

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed: node ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

async function main() {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });

  const projectDir = path.join(tempRoot, 'deploy-fixture');
  copyFixture(fixtureRoot, projectDir);

  log('Running vista build...');
  runNode([vistaBin, 'build'], { cwd: projectDir });

  log('Dry-run deploy: vercel');
  runNode([vistaBin, 'deploy', '--target', 'vercel', '--dry-run', '--force', '--skip-build'], {
    cwd: projectDir,
  });
  assert.equal(fs.existsSync(path.join(projectDir, '.vercel', 'output', 'config.json')), true);
  assert.equal(
    fs.existsSync(path.join(projectDir, '.vercel', 'output', 'functions', 'index.func', 'index.js')),
    true,
    'Vercel output must include a Node SSR function'
  );
  assert.equal(
    fs.existsSync(path.join(projectDir, '.vercel', 'output', 'functions', 'index.func', '.vista', 'standalone', 'server.js')),
    true,
    'Vercel function must pack standalone Flight server'
  );
  const vercelConfig = JSON.parse(
    fs.readFileSync(path.join(projectDir, '.vercel', 'output', 'functions', 'index.func', '.vc-config.json'), 'utf8')
  );
  assert.equal(vercelConfig.runtime, 'nodejs20.x');
  assert.equal(vercelConfig.supportsResponseStreaming, true);
  assert.equal(vercelConfig.maxDuration, 60);
  const vercelHandler = fs.readFileSync(
    path.join(projectDir, '.vercel', 'output', 'functions', 'index.func', 'index.js'),
    'utf8'
  );
  assert.match(vercelHandler, /\.vista['"]?, ['"]standalone['"]?, ['"]server\.js['"]/);

  log('Dry-run deploy: cloudflare');
  runNode([vistaBin, 'deploy', '--target', 'cloudflare', '--dry-run', '--force', '--skip-build'], {
    cwd: projectDir,
  });
  const wrangler = fs.readFileSync(path.join(projectDir, 'wrangler.toml'), 'utf8');
  assert.match(wrangler, /\[\[containers\]\]/);
  assert.match(wrangler, /VistaSSR/);
  assert.match(wrangler, /new_sqlite_classes/);
  const cfWorker = fs.readFileSync(
    path.join(projectDir, '.vista', 'deploy', 'cloudflare', 'worker.js'),
    'utf8'
  );
  assert.match(cfWorker, /export class VistaSSR/);
  assert.match(cfWorker, /getTcpPort\(3003\)/);
  assert.equal(fs.existsSync(path.join(projectDir, '.vista', 'deploy', 'cloudflare', 'worker.js')), true);
  assert.equal(fs.existsSync(path.join(projectDir, 'Dockerfile')), true);

  log('Dry-run deploy: render');
  runNode([vistaBin, 'deploy', '--target', 'render', '--dry-run', '--skip-build'], {
    cwd: projectDir,
  });
  assert.equal(fs.existsSync(path.join(projectDir, '.vista', 'standalone', 'server.js')), true);
  assert.equal(fs.existsSync(path.join(projectDir, 'render.yaml')), true);

  log('Dry-run deploy: docker');
  runNode([vistaBin, 'deploy', '--target', 'docker', '--dry-run', '--force', '--skip-build'], {
    cwd: projectDir,
  });
  const dockerfile = fs.readFileSync(path.join(projectDir, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /\.vista\/standalone\/server\.js/);
  assert.match(dockerfile, /node_modules/);

  log('Dry-run deploy: netlify');
  runNode([vistaBin, 'deploy', '--target', 'netlify', '--dry-run', '--force', '--skip-build'], {
    cwd: projectDir,
  });
  assert.equal(fs.existsSync(path.join(projectDir, 'netlify.toml')), true);
  assert.equal(fs.existsSync(path.join(projectDir, 'netlify', 'functions', 'ssr.js')), true);
  assert.equal(
    fs.existsSync(path.join(projectDir, 'netlify', 'functions', '.vista', 'standalone', 'server.js')),
    true
  );
  const netlifyToml = fs.readFileSync(path.join(projectDir, 'netlify.toml'), 'utf8');
  assert.match(netlifyToml, /\.netlify\/functions\/ssr/);
  const netlifyHandler = fs.readFileSync(path.join(projectDir, 'netlify', 'functions', 'ssr.js'), 'utf8');
  assert.match(netlifyHandler, /http\.IncomingMessage/);
  assert.match(netlifyHandler, /http\.ServerResponse/);

  log('All deploy integration checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
