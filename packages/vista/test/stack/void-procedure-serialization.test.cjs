'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  serializeWithMode,
  deserializeWithMode,
  createSerializer,
} = require('../../dist/stack/server/serialization');
const { executeRoute, createResponseToolkit } = require('../../dist/stack/server/executor');
const { vstack } = require('../../dist/stack/index');
const { createVistaClient } = require('../../dist/stack/client');

test('serializeWithMode returns undefined when passed undefined (Issue #129)', () => {
  // Direct reproduction from Issue #129:
  // Before fix: threw SyntaxError: "undefined" is not valid JSON
  assert.equal(serializeWithMode(undefined, 'json'), undefined);
  assert.equal(serializeWithMode(undefined, 'superjson'), undefined);

  assert.equal(deserializeWithMode(undefined, 'json'), undefined);
  assert.equal(deserializeWithMode(undefined, 'superjson'), undefined);

  const jsonSerializer = createSerializer('json');
  assert.equal(jsonSerializer.serialize(undefined), undefined);
  assert.equal(jsonSerializer.deserialize(undefined), undefined);

  const superSerializer = createSerializer('superjson');
  assert.equal(superSerializer.serialize(undefined), undefined);
  assert.equal(superSerializer.deserialize(undefined), undefined);
});

test('serializeWithMode preserves null and standard JSON payloads', () => {
  assert.equal(serializeWithMode(null, 'json'), null);
  assert.equal(serializeWithMode(null, 'superjson'), null);

  assert.deepEqual(serializeWithMode({ ok: true, count: 42 }, 'json'), { ok: true, count: 42 });
  assert.deepEqual(serializeWithMode(['a', 'b'], 'json'), ['a', 'b']);
});

test('executeRoute handles void mutation procedure without throwing SyntaxError', async () => {
  const v = vstack.init();
  let mutationExecuted = false;

  const router = v.router({
    reset: v.procedure.mutation(() => {
      mutationExecuted = true;
      // Void mutation: resolves to undefined
    }),
  });

  const result = await executeRoute(router, {
    path: '/reset',
    method: 'POST',
    req: {},
    ctx: {},
    env: {},
    serialization: 'json',
  });

  assert.equal(mutationExecuted, true);
  assert.equal(result.data, undefined);
  assert.equal(result.serializedData, undefined);
  assert.equal(result.path, '/reset');
  assert.equal(result.method, 'post');
});

test('executeRoute handles void query procedure without throwing SyntaxError', async () => {
  const v = vstack.init();
  const router = v.router({
    noop: v.procedure.query(() => {}),
  });

  const result = await executeRoute(router, {
    path: '/noop',
    method: 'GET',
    req: {},
    ctx: {},
    env: {},
    serialization: 'json',
  });

  assert.equal(result.data, undefined);
  assert.equal(result.serializedData, undefined);
});

test('createResponseToolkit c.json(undefined) safely handles undefined without throwing TypeError', async () => {
  const toolkit = createResponseToolkit('json');
  const response = toolkit.json(undefined, 200);

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data, null);
});

test('createVistaClient handles inputless POST and void response', async () => {
  let requestReceived = null;
  const client = createVistaClient({
    fetch: async (url, init) => {
      requestReceived = { url, method: init?.method, body: init?.body };
      return new Response('', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    serialization: 'json',
  });

  const result = await client.$post('/reset');

  assert.equal(result, undefined);
  assert.ok(requestReceived);
  assert.equal(requestReceived.url, '/reset');
  assert.equal(requestReceived.method, 'POST');
  assert.equal(requestReceived.body, undefined);
});
