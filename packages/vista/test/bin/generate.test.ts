import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runGenerateCommand } from '../../src/bin/generate';

function makeTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vista-generate-'));
}

test('api-init scaffolds typed API files and is idempotent', async () => {
  const cwd = makeTempWorkspace();
  const logs: string[] = [];
  const errors: string[] = [];

  try {
    fs.writeFileSync(
      path.join(cwd, 'vista.config.ts'),
      ['const config = {', '  images: {},', '};', '', 'export default config;', ''].join('\n'),
      'utf8'
    );

    const firstCode = await runGenerateCommand(['api-init'], {
      cwd,
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
    });
    assert.equal(firstCode, 0);

    const entryPath = path.join(cwd, 'app', 'api', 'typed.ts');
    const routerPath = path.join(cwd, 'app', 'api', 'routers', 'index.ts');
    const procedurePath = path.join(cwd, 'app', 'api', 'procedures', 'health.ts');
    assert.equal(fs.existsSync(entryPath), true);
    assert.equal(fs.existsSync(routerPath), true);
    assert.equal(fs.existsSync(procedurePath), true);

    const configSource = fs.readFileSync(path.join(cwd, 'vista.config.ts'), 'utf8');
    assert.match(configSource, /typedApi/);
    assert.match(configSource, /enabled:\s*true/);

    const firstEntrypointSnapshot = fs.readFileSync(entryPath, 'utf8');
    const secondCode = await runGenerateCommand(['api-init'], { cwd });
    assert.equal(secondCode, 0);
    const secondEntrypointSnapshot = fs.readFileSync(entryPath, 'utf8');
    assert.equal(secondEntrypointSnapshot, firstEntrypointSnapshot);

    assert.equal(errors.length, 0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('router and procedure generators create expected templates safely', async () => {
  const cwd = makeTempWorkspace();

  try {
    const routerCode = await runGenerateCommand(['router', 'users'], { cwd });
    assert.equal(routerCode, 0);
    const routerPath = path.join(cwd, 'app', 'api', 'routers', 'users.ts');
    assert.equal(fs.existsSync(routerPath), true);
    const routerSource = fs.readFileSync(routerPath, 'utf8');
    assert.match(routerSource, /createUsersRouter/);
    assert.match(routerSource, /v\.procedure\.query/);

    const procedureCode = await runGenerateCommand(['procedure', 'create-user', 'post'], { cwd });
    assert.equal(procedureCode, 0);
    const procedurePath = path.join(cwd, 'app', 'api', 'procedures', 'create-user.ts');
    assert.equal(fs.existsSync(procedurePath), true);
    const procedureSource = fs.readFileSync(procedurePath, 'utf8');
    assert.match(procedureSource, /createUserProcedure/);
    assert.match(procedureSource, /v\.procedure\.mutation/);

    const beforeSnapshot = fs.readFileSync(routerPath, 'utf8');
    const secondRouterCode = await runGenerateCommand(['router', 'users'], { cwd });
    assert.equal(secondRouterCode, 0);
    const afterSnapshot = fs.readFileSync(routerPath, 'utf8');
    assert.equal(afterSnapshot, beforeSnapshot);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('auth generator scaffolds config and catch-all route', async () => {
  const cwd = makeTempWorkspace();
  const logs: string[] = [];

  try {
    const exitCode = await runGenerateCommand(['auth'], {
      cwd,
      log: (message) => logs.push(message),
    });
    assert.equal(exitCode, 0);

    const configPath = path.join(cwd, 'auth.ts');
    const routePath = path.join(cwd, 'app', 'api', 'auth', '[...vista]', 'route.ts');
    assert.equal(fs.existsSync(configPath), true);
    assert.equal(fs.existsSync(routePath), true);

    const configSource = fs.readFileSync(configPath, 'utf8');
    assert.match(configSource, /from 'vista\/auth'/);
    assert.match(configSource, /VistaAuth\(/);

    const routeSource = fs.readFileSync(routePath, 'utf8');
    assert.match(routeSource, /export const \{ GET, POST \} = handlers/);

    const secondCode = await runGenerateCommand(['auth'], { cwd });
    assert.equal(secondCode, 0);
    assert.equal(fs.readFileSync(configPath, 'utf8'), configSource);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
