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

  log('Dry-run deploy: cloudflare');
  runNode([vistaBin, 'deploy', '--target', 'cloudflare', '--dry-run', '--force', '--skip-build'], {
    cwd: projectDir,
  });
  assert.equal(fs.existsSync(path.join(projectDir, '.vista', 'deploy', 'cloudflare', '_routes.json')), true);
  assert.equal(fs.existsSync(path.join(projectDir, 'wrangler.toml')), true);

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

  log('Dry-run deploy: netlify');
  runNode([vistaBin, 'deploy', '--target', 'netlify', '--dry-run', '--force', '--skip-build'], {
    cwd: projectDir,
  });
  assert.equal(fs.existsSync(path.join(projectDir, '.vista', 'deploy', 'netlify', '_redirects')), true);
  assert.equal(fs.existsSync(path.join(projectDir, 'netlify.toml')), true);

  log('All deploy integration checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
