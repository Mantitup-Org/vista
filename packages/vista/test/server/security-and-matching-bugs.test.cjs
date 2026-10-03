const assert = require('node:assert/strict');
const { test } = require('node:test');

const { cors, chain } = require('../../dist/server/middleware-security');
const { patternToRegExp } = require('../../dist/server/middleware-runner');

test('cors reflects Origin and sets Vary when origin is * and credentials are true (#137)', () => {
  const handler = cors({ origin: '*', credentials: true });
  const req = new Request('http://localhost:3000/api', {
    headers: { origin: 'https://app.example.com' },
  });
  const headers = handler(req);
  assert.equal(headers.get('Access-Control-Allow-Origin'), 'https://app.example.com');
  assert.equal(headers.get('Vary'), 'Origin');
  assert.equal(headers.get('Access-Control-Allow-Credentials'), 'true');
});

test('cors keeps wildcard when credentials are not enabled', () => {
  const handler = cors({ origin: '*' });
  const req = new Request('http://localhost:3000/api', {
    headers: { origin: 'https://app.example.com' },
  });
  const headers = handler(req);
  assert.equal(headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(headers.get('Vary'), null);
});

test('chain allows standard await next() idiom returning void (#139)', async () => {
  const events = [];
  const composed = chain([
    async (ctx) => {
      events.push('m1-before');
      await ctx.next();
      events.push('m1-after');
    },
    async (ctx) => {
      events.push('m2');
      return new Response('ok');
    },
  ]);

  const res = await composed({ next: async () => new Response('terminal') });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
  assert.deepEqual(events, ['m1-before', 'm2', 'm1-after']);
});

test('chain prevents genuine double next() calls (#139)', async () => {
  const composed = chain([
    async (ctx) => {
      await ctx.next();
      await ctx.next();
    },
    async () => new Response('ok'),
  ]);

  await assert.rejects(
    async () => composed({ next: async () => new Response('terminal') }),
    /next\(\) called multiple times/
  );
});

test('patternToRegExp escapes literal regex metacharacters (#141)', () => {
  const re = patternToRegExp('/blog/post.html');
  assert.equal(re.test('/blog/post.html'), true);
  assert.equal(re.test('/blog/postXhtml'), false);

  const reApi = patternToRegExp('/api/v1.0');
  assert.equal(reApi.test('/api/v1.0'), true);
  assert.equal(reApi.test('/api/v1X0'), false);

  const reWildcard = patternToRegExp('/docs/:path*');
  assert.equal(reWildcard.test('/docs/a/b/c'), true);
  assert.equal(reWildcard.test('/docs'), true);
});

test('expandPattern handles prefix collision without corrupting URLs (#143)', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../../dist/server/static-generator.js'),
    'utf8'
  );
  const fnBody = src.match(/function expandPattern\(pattern, params\) \{[\s\S]*?\n\}/)[0];
  const expandPattern = new Function('return ' + fnBody)();

  const url = expandPattern('/:idType/:id', { id: '1', idType: 'post' });
  assert.equal(url, '/post/1');

  const catchAll = expandPattern('/blog/:slug*', { slug: ['2026', '09', 'hello'] });
  assert.equal(catchAll, '/blog/2026/09/hello');
});
