import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const profile = process.argv.includes('--debug') ? 'debug' : 'release';
const binaryName = process.platform === 'win32' ? 'flashpack-cli.exe' : 'flashpack-cli';
const built = path.join(repoRoot, 'target', profile, binaryName);
const destDir = path.join(packageRoot, 'native', `${process.platform}-${process.arch}`);
const dest = path.join(destDir, binaryName);

if (!process.argv.includes('--copy-only')) {
  const cargo = spawnSync(
    'cargo',
    ['build', '-p', 'flashpack-cli', ...(profile === 'release' ? ['--release'] : [])],
    { cwd: repoRoot, stdio: 'inherit' }
  );
  if (cargo.status !== 0) {
    process.exit(cargo.status || 1);
  }
}

if (!fs.existsSync(built)) {
  console.error(`[flashpack] binary missing: ${built}`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(built, dest);
const bytes = fs.statSync(dest).size;
console.log(`[flashpack] staged ${dest} (${bytes} bytes)`);

const pnpmDir = path.join(repoRoot, 'node_modules', '.pnpm');
if (fs.existsSync(pnpmDir)) {
  for (const entry of fs.readdirSync(pnpmDir)) {
    if (!entry.startsWith('@vistagenic+vista@')) continue;
    const linked = path.join(pnpmDir, entry, 'node_modules', '@vistagenic', 'vista', 'native', `${process.platform}-${process.arch}`);
    fs.mkdirSync(linked, { recursive: true });
    fs.copyFileSync(dest, path.join(linked, binaryName));
    console.log(`[flashpack] mirrored ${path.join(linked, binaryName)}`);
  }
}
