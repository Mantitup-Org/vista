import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const enginePath = path.resolve(__dirname, '../../src/server/engine.ts');
const rscEnginePath = path.resolve(__dirname, '../../src/server/rsc-engine.ts');

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

test('legacy engine keeps typed API handling scoped to /api and preserves middleware/image/static pipeline', () => {
  const source = readSource(enginePath);

  assert.match(source, /if\s*\(req\.path\.startsWith\('\/api\/'\)\)/);
  assert.match(source, /runMiddleware\(req,\s*cwd,\s*isDev\)/);
  assert.match(source, /applyMiddlewareResult\(middlewareResult,\s*req,\s*res\)/);
  assert.match(source, /app\.get\(IMAGE_ENDPOINT,\s*imageHandler\)/);
  assert.match(source, /app\.use\(express\.static\(path\.join\(cwd,\s*BUILD_DIR\)\)\)/);
});

test('rsc engine keeps server-action proxy and rsc/static pipelines intact after typed API bridge', () => {
  const source = readSource(rscEnginePath);

  assert.match(source, /if\s*\(req\.path\.startsWith\('\/api\/'\)\)/);
  assert.match(source, /app\.get\('\/rsc\*',\s*proxyRSCRequest\)/);
  assert.match(source, /app\.post\('\/rsc\*',\s*proxyRSCRequest\)/);
  assert.match(source, /rsc-action/);
  assert.match(source, /runMiddleware\(req,\s*(?:cwd|runtimeRoot),\s*isDev\)/);
  assert.match(source, /app\.get\(IMAGE_ENDPOINT,\s*imageHandler\)/);
  assert.match(source, /app\.use\(URL_PREFIX,\s*express\.static\(path\.join\(cwd,\s*BUILD_DIR\)\)\)/);
});
