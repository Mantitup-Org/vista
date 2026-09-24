const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { runLegacyApiRoute } = require('../../dist/server/typed-api-runtime');

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vista-cookie-test-'));
}

function createMockExpressReq(options = {}) {
  const headers = options.headers || {};
  return {
    method: options.method || 'GET',
    url: options.url || '/api/test',
    originalUrl: options.url || '/api/test',
    protocol: 'http',
    headers,
    complete: true,
    readableEnded: true,
    body: options.body,
    get(name) {
      return headers[name.toLowerCase()] || headers[name];
    },
    async *[Symbol.asyncIterator]() {
      if (options.streamBody) {
        yield Buffer.isBuffer(options.streamBody)
          ? options.streamBody
          : Buffer.from(options.streamBody);
      }
    },
  };
}

function createMockExpressRes() {
  const res = {
    statusCode: 200,
    headers: {},
    ended: false,
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.headers['Content-Type'] = 'application/json';
      this.body = data;
      this.ended = true;
      return this;
    },
    end(data) {
      this.body = data;
      this.ended = true;
      return this;
    },
    send(data) {
      this.body = data;
      this.ended = true;
      return this;
    },
  };
  return res;
}

test('runLegacyApiRoute preserves multiple Set-Cookie headers in Response', async () => {
  const cwd = makeTempProject();
  const apiFile = path.join(cwd, 'route.js');

  fs.writeFileSync(
    apiFile,
    `
    exports.GET = async function (req) {
      const headers = new Headers();
      headers.append('Set-Cookie', 'session=abc123xyz; Path=/; HttpOnly');
      headers.append('Set-Cookie', 'csrf_token=987654; Path=/; SameSite=Strict');
      headers.set('X-Custom-Header', 'vista-test');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers,
      });
    };
    `,
    'utf8'
  );

  const req = createMockExpressReq({ method: 'GET', url: '/api/auth/session' });
  const res = createMockExpressRes();

  try {
    await runLegacyApiRoute({
      req,
      res,
      apiPath: apiFile,
      isDev: true,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-custom-header'] || res.headers['X-Custom-Header'], 'vista-test');
    assert.ok(
      Array.isArray(res.headers['Set-Cookie']),
      `Expected Set-Cookie header to be an array, got ${typeof res.headers['Set-Cookie']}`
    );
    assert.equal(res.headers['Set-Cookie'].length, 2);
    assert.equal(res.headers['Set-Cookie'][0], 'session=abc123xyz; Path=/; HttpOnly');
    assert.equal(res.headers['Set-Cookie'][1], 'csrf_token=987654; Path=/; SameSite=Strict');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('runLegacyApiRoute catches BodyParseError and responds with 400 Bad Request', async () => {
  const cwd = makeTempProject();
  const apiFile = path.join(cwd, 'route.js');

  fs.writeFileSync(
    apiFile,
    `
    class MockBodyParseError extends Error {
      constructor(message) {
        super(message);
        this.name = 'BodyParseError';
        this.status = 400;
      }
    }
    exports.POST = async function (req) {
      throw new MockBodyParseError('Malformed JSON payload received');
    };
    `,
    'utf8'
  );

  const req = createMockExpressReq({
    method: 'POST',
    url: '/api/parse-fail',
    headers: { 'content-type': 'application/json' },
    body: 'invalid-json{',
  });
  const res = createMockExpressRes();

  try {
    await runLegacyApiRoute({
      req,
      res,
      apiPath: apiFile,
      isDev: true,
    });

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Malformed JSON payload received' });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});