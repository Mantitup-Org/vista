import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveLegacyRouteHandlerMatch } from '../../src/server/typed-api-runtime';

function makeTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vista-api-routes-'));
}

test('resolves static and dynamic app route handlers with params', () => {
  const cwd = makeTempProject();
  try {
    const staticRoute = path.join(cwd, 'app', 'api', 'health', 'route.ts');
    const dynamicRoute = path.join(cwd, 'app', 'api', 'users', '[id]', 'route.ts');
    fs.mkdirSync(path.dirname(staticRoute), { recursive: true });
    fs.mkdirSync(path.dirname(dynamicRoute), { recursive: true });
    fs.writeFileSync(staticRoute, 'export async function GET() { return Response.json({ ok: true }); }');
    fs.writeFileSync(
      dynamicRoute,
      'export async function GET(_req, { params }) { return Response.json(params); }'
    );

    const health = resolveLegacyRouteHandlerMatch(cwd, '/api/health');
    assert.equal(health?.filePath, staticRoute);
    assert.deepEqual(health?.params, {});

    const user = resolveLegacyRouteHandlerMatch(cwd, '/api/users/abc');
    assert.equal(user?.filePath, dynamicRoute);
    assert.deepEqual(user?.params, { id: 'abc' });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
