#!/usr/bin/env node

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { expandPattern } = require('../../dist/server/static-generator');

test('expandPattern replaces simple params correctly', () => {
  assert.equal(expandPattern('/blog/:slug', { slug: 'hello-world' }), '/blog/hello-world');
  assert.equal(expandPattern('/users/:id/profile', { id: '42' }), '/users/42/profile');
});

test('expandPattern handles catch-all and optional catch-all params', () => {
  assert.equal(expandPattern('/docs/:slug*', { slug: ['getting-started', 'install'] }), '/docs/getting-started/install');
  assert.equal(expandPattern('/shop/:category*?', { category: ['shoes', 'running'] }), '/shop/shoes/running');
});

test('expandPattern avoids param prefix collisions (:id vs :idType) (#143)', () => {
  // Regardless of key order, :id must not collide with :idType
  assert.equal(
    expandPattern('/:idType/:id', { id: '1', idType: 'post' }),
    '/post/1'
  );
  assert.equal(
    expandPattern('/:id/:idType', { id: '1', idType: 'post' }),
    '/1/post'
  );
  assert.equal(
    expandPattern('/item/:id/sub/:idType', { idType: 'sku', id: '99' }),
    '/item/99/sub/sku'
  );
});
