const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createImageHandler } = require('../../dist/server/image-optimizer.js');

function createMockReq(query = {}, headers = {}) {
  return {
    query,
    headers: { accept: 'image/webp,image/avif,*/*', ...headers },
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    send(data) {
      res.body = data;
      return res;
    },
    end() {
      return res;
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
  };
  return res;
}

test('image-optimizer rejects path traversal attempts with 403 Forbidden', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-img-test-'));
  const publicDir = path.join(tempDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });

  // Create a secret file outside public
  const secretFile = path.join(tempDir, 'secret.txt');
  fs.writeFileSync(secretFile, 'SUPER_SECRET_KEY=12345');

  const handler = createImageHandler(tempDir, false);

  // 1. Classic ../ traversal
  const req1 = createMockReq({ url: '../secret.txt', w: '640' });
  const res1 = createMockRes();
  await handler(req1, res1);
  assert.equal(res1.statusCode, 403);
  assert.match(String(res1.body), /Forbidden: invalid image path/);

  // 2. Encoded ../ traversal (%2e%2e)
  const req2 = createMockReq({ url: '%2e%2e/secret.txt', w: '640' });
  const res2 = createMockRes();
  await handler(req2, res2);
  assert.equal(res2.statusCode, 403);
  assert.match(String(res2.body), /Forbidden: invalid image path/);

  // 3. Leading slash traversal
  const req3 = createMockReq({ url: '/../../secret.txt', w: '640' });
  const res3 = createMockRes();
  await handler(req3, res3);
  assert.equal(res3.statusCode, 403);
  assert.match(String(res3.body), /Forbidden: invalid image path/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('image-optimizer returns 404 for missing image in public directory', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-img-test-'));
  const publicDir = path.join(tempDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });

  const handler = createImageHandler(tempDir, false);

  const req = createMockReq({ url: '/nonexistent-photo.jpg', w: '640' });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.match(String(res.body), /Image not found/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('image-optimizer blocks SVG images when dangerouslyAllowSVG is false', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-img-test-'));
  const publicDir = path.join(tempDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });

  const svgFile = path.join(publicDir, 'icon.svg');
  fs.writeFileSync(svgFile, '<svg><circle cx="50" cy="50" r="40"/></svg>');

  const handler = createImageHandler(tempDir, false);

  const req = createMockReq({ url: '/icon.svg', w: '640' });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /SVG images are not allowed/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('image-optimizer sanitizes query parameters from image URLs', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-img-test-'));
  const publicDir = path.join(tempDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });

  // Create valid 1x1 png dummy
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82
  ]);
  const imgFile = path.join(publicDir, 'avatar.png');
  fs.writeFileSync(imgFile, pngHeader);

  const handler = createImageHandler(tempDir, false);

  // Request with query param in url
  const req = createMockReq({ url: '/avatar.png?v=version42&cache=bust#header', w: '640' });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
