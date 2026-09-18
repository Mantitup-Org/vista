#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const vistaSrc = path.join(repoRoot, 'packages', 'vista', 'src');

function registerTypeScriptRuntime() {
  const searchRoots = [repoRoot, path.join(repoRoot, 'packages', 'vista')];
  const resolveFromWorkspace = (specifier) => {
    for (const root of searchRoots) {
      try {
        return require.resolve(specifier, { paths: [root] });
      } catch {}
    }
    throw new Error(`Unable to resolve ${specifier}`);
  };
  try {
    require(resolveFromWorkspace('@swc-node/register'));
    return;
  } catch {}
  try {
    require(resolveFromWorkspace('ts-node/register/transpile-only'));
    return;
  } catch {}
  throw new Error('No TypeScript runtime found.');
}

registerTypeScriptRuntime();

const { vstack } = require(path.join(vistaSrc, 'stack', 'index.ts'));
const { executeRoute, StackOutputValidationError } = require(
  path.join(vistaSrc, 'stack', 'server', 'executor.ts')
);
const { writeVistaTypes, writeVistaTrace } = require(path.join(vistaSrc, 'build', 'manifest.ts'));

async function main() {
  const v = vstack.init();

  const outputSchema = {
    parse(value) {
      if (!value || value.ok !== true) {
        throw new Error('ok must be true');
      }
      return { ok: true };
    },
  };

  const denied = v.middleware(({ c }) => c.json({ error: 'denied' }, 401));
  const router = v.router({
    ping: v.procedure.output(outputSchema).query(() => ({ ok: true })),
    bad: v.procedure.output(outputSchema).query(() => ({ ok: false })),
    echo: v.procedure
      .input({
        parse(value) {
          return { text: String(value && value.text ? value.text : '') };
        },
      })
      .query(({ input, req }) => ({
        text: input.text,
        session: req.cookies ? req.cookies.get('sid')?.value : null,
      })),
    secret: v.procedure.use(denied).query(() => ({ ok: true })),
  });

  const ping = await executeRoute(router, {
    path: '/ping',
    method: 'GET',
    req: { query: {} },
    ctx: {},
    env: {},
  });
  assert.deepEqual(ping.data, { ok: true });

  await assert.rejects(
    () =>
      executeRoute(router, {
        path: '/bad',
        method: 'GET',
        req: { query: {} },
        ctx: {},
        env: {},
      }),
    (error) => error instanceof StackOutputValidationError && error.status === 500
  );

  const caller = v.createCaller(router, {
    ctx: {},
    env: {},
    req: {
      cookies: {
        get(name) {
          return name === 'sid' ? { name, value: 'abc' } : undefined;
        },
        getAll() {
          return [{ name: 'sid', value: 'abc' }];
        },
        has(name) {
          return name === 'sid';
        },
      },
    },
  });
  assert.deepEqual(await caller.echo({ text: 'hi' }), { text: 'hi', session: 'abc' });
  assert.deepEqual(await caller.ping(), { ok: true });

  const blocked = await executeRoute(router, {
    path: '/secret',
    method: 'GET',
    req: { query: {} },
    ctx: {},
    env: {},
  });
  assert.equal(blocked.data instanceof Response, true);
  assert.equal(blocked.data.status, 401);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-types-'));
  try {
    writeVistaTypes(tmp, ['/', '/docs', '/api/health']);
    writeVistaTrace(tmp, { copiedFiles: ['a', 'b'], generatedAt: 'now' });
    const routesDts = fs.readFileSync(path.join(tmp, 'types', 'routes.d.ts'), 'utf8');
    assert.match(routesDts, /VistaAppRoute/);
    assert.match(routesDts, /'\/api\/health'/);
    const trace = JSON.parse(fs.readFileSync(path.join(tmp, 'trace'), 'utf8'));
    assert.equal(trace.schemaVersion, 1);
    assert.equal(trace.source, 'server/file-trace.json');
    assert.equal(trace.copiedFiles, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('[test:vstack] ALL PASSED');
}

main().catch((error) => {
  console.error('[test:vstack] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
