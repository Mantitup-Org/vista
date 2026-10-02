const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const rust = require(path.join(__dirname, '..', '..', 'dist', 'rust'));

test('route classification matches the app router', () => {
  assert.deepEqual(rust.classifyAppSegmentFallback('[[...slug]]'), {
    kind: 'optional-catch-all',
    segment: 'slug',
  });
  assert.deepEqual(rust.classifyAppSegmentFallback('(shop)'), {
    kind: 'group',
    segment: 'shop',
  });
  assert.equal(
    rust.routePatternFallback(['(shop)', 'products', '[id]', '[[...slug]]']),
    '/products/:id/:slug*?'
  );
  assert.equal(rust.routePattern(['(shop)', '@modal', 'products', '[id]']), '/products/:id');
});

test('error codes and taskless steps stay aligned with the crates', () => {
  assert.equal(rust.encodeVistaErrorCode('ROUTE_MISSING'), 'VISTA_ROUTE_MISSING');
  assert.equal(rust.encodeVistaErrorCode('VISTA_ROUTE_MISSING'), 'VISTA_ROUTE_MISSING');
  assert.equal(rust.encodeVistaErrorCode('VISTA_route'), 'VISTA_VISTA_route');
  assert.deepEqual(
    rust.findVistaErrorCodes("throw new Error('VISTA_ROUTE_MISSING') // VISTA_BAD_PAGE"),
    ['ROUTE_MISSING', 'BAD_PAGE']
  );
  assert.deepEqual(rust.tasklessSteps(true), ['scan', 'reuse-state', 'serve']);
  assert.deepEqual(rust.tasklessSteps(false), ['scan', 'queue-work', 'serve']);
});
