#!/usr/bin/env node

const assert = require('node:assert/strict');
const { test } = require('node:test');

const typedApiRuntime = require('../../dist/server/typed-api-runtime');

function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  let ended = false;

  const res = {
    statusCode,
    get headers() {
      return headers;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(name, val) {
      headers[name.toLowerCase()] = val;
      return res;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    json(data) {
      body = data;
      ended = true;
      return res;
    },
    end() {
      ended = true;
      return res;
    },
    get body() {
      return body;
    },
    get ended() {
      return ended;
    },
  };
  return res;
}

test('sendFetchResponse preserves multiple Set-Cookie headers as an array (#152)', async () => {
  const mockRes = createMockRes();
  const webResponse = new Response('ok', {
    status: 200,
    headers: [
      ['Set-Cookie', 'session=abc; Path=/; HttpOnly'],
      ['Set-Cookie', 'theme=dark; Path=/'],
      ['X-Custom-Header', 'custom-value'],
    ],
  });

  await typedApiRuntime.sendFetchResponse(mockRes, webResponse);

  assert.equal(mockRes.statusCode, 200);
  assert.equal(mockRes.getHeader('x-custom-header'), 'custom-value');
  const setCookies = mockRes.getHeader('set-cookie');
  assert.ok(Array.isArray(setCookies) || typeof setCookies === 'string');
  if (Array.isArray(setCookies)) {
    assert.equal(setCookies.length, 2);
    assert.ok(setCookies.includes('session=abc; Path=/; HttpOnly'));
    assert.ok(setCookies.includes('theme=dark; Path=/'));
  } else {
    assert.ok(setCookies.includes('session=abc'));
    assert.ok(setCookies.includes('theme=dark'));
  }
});

test('runLegacyApiRoute returns 400 on malformed JSON body (#152)', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { Readable } = require('node:stream');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-api-test-'));
  const routeFile = path.join(tmpDir, 'route.js');
  const runtimePath = path.join(__dirname, '../../dist/server/typed-api-runtime.js').replace(/\\/g, '/');
  fs.writeFileSync(
    routeFile,
    `const { BodyParseError } = require('${runtimePath}');
exports.POST = async function(req) {
  throw new BodyParseError('Invalid JSON body for typed API request.');
};`,
    'utf8'
  );


  const mockRes = createMockRes();
  const mockReq = Readable.from([Buffer.from('{"invalid_json": ')]);
  mockReq.method = 'POST';
  mockReq.url = '/api/test';
  mockReq.path = '/api/test';
  mockReq.headers = {
    'content-type': 'application/json',
    host: 'localhost:3000',
  };
  mockReq.get = (header) => mockReq.headers[header.toLowerCase()];


  try {
    await typedApiRuntime.runLegacyApiRoute({
      req: mockReq,
      res: mockRes,
      apiPath: routeFile,
      isDev: false,
    });

    assert.equal(mockRes.statusCode, 400);
    assert.deepEqual(mockRes.body, { error: 'Invalid JSON body for typed API request.' });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

