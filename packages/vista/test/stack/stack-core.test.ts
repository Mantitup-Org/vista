import assert from 'node:assert/strict';
import test from 'node:test';

import { vstack } from '../../src/stack/index';
import { executeRoute, StackValidationError } from '../../src/stack/server/executor';

test('router creates flat route map for nested procedures', () => {
  const v = vstack.init();

  const health = v.procedure.query(() => ({ ok: true }));
  const listUsers = v.procedure.query(() => [{ id: 'u1' }]);
  const createUser = v.procedure.mutation(() => ({ created: true }));

  const router = v.router(
    {
      health,
      users: {
        list: listUsers,
        create: createUser,
      },
    },
    { basePath: '/api' }
  );

  const routes = Object.keys(router.routes).sort();
  assert.deepEqual(routes, ['/api/health', '/api/users/create', '/api/users/list']);
  assert.equal(router.metadata.procedures['/api/health'].type, 'get');
  assert.equal(router.metadata.procedures['/api/users/create'].type, 'post');
});

test('middleware chain merges context additions in execution order', async () => {
  const v = vstack.init<{ requestId: string }, { actorId: string }>();
  const events: string[] = [];

  const attachUser = v.middleware(async ({ ctx, env, next }) => {
    events.push(`mw1-before:${ctx.requestId}`);
    const downstream = await next({ userId: env.actorId });
    events.push(`mw1-after:${String((downstream as any).tenantId)}`);
    return { auditedBy: 'mw1' };
  });

  const attachTenant = v.middleware(async ({ ctx, next }) => {
    events.push(`mw2-before:${String((ctx as any).userId)}`);
    return next({ tenantId: 'tenant-a' });
  });

  const route = v.procedure
    .use(attachUser)
    .use(attachTenant)
    .query(({ ctx }) => ({
      requestId: ctx.requestId,
      userId: (ctx as any).userId,
      tenantId: (ctx as any).tenantId,
      auditedBy: (ctx as any).auditedBy,
    }));

  const router = v.router({ profile: route });
  const result = await executeRoute(router, {
    path: '/profile',
    method: 'GET',
    req: { query: {} },
    ctx: { requestId: 'req-1' },
    env: { actorId: 'user-7' },
  });

  assert.deepEqual(result.data, {
    requestId: 'req-1',
    userId: 'user-7',
    tenantId: 'tenant-a',
    auditedBy: 'mw1',
  });
  assert.deepEqual(events, ['mw1-before:req-1', 'mw2-before:user-7', 'mw1-after:tenant-a']);
});

test('procedure Response returns keep their HTTP status', async () => {
  const v = vstack.init();
  const router = v.router({
    created: v.procedure.mutation(({ c }) => c.json({ ok: true }, 201)),
  });

  const result = await executeRoute(router, {
    path: '/created',
    method: 'POST',
    req: { body: {} },
    ctx: {},
    env: {},
  });

  assert.ok(result.data instanceof Response);
  assert.equal(result.data.status, 201);
  assert.deepEqual(await result.data.json(), { ok: true });
});

test('input validation throws StackValidationError on schema failure', async () => {
  const v = vstack.init();

  const queryInputSchema = {
    parse(value: unknown) {
      const candidate = value as { slug?: unknown };
      if (!candidate || typeof candidate.slug !== 'string') {
        throw new Error('slug must be provided');
      }
      return { slug: candidate.slug };
    },
  };

  const router = v.router({
    post: v.procedure.input(queryInputSchema).query(({ input }) => input.slug.toUpperCase()),
  });

  await assert.rejects(
    () =>
      executeRoute(router, {
        path: '/post',
        method: 'GET',
        req: { query: {} },
        ctx: {},
        env: {},
      }),
    (error: unknown) => error instanceof StackValidationError && error.status === 400
  );
});
