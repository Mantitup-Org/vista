const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');

const { fetchRemoteImage } = require('../../dist/server/image-optimizer');

test('fetchRemoteImage blocks redirect to unapproved host (SSRF defense) (#133)', async () => {
  let server;
  let port;

  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.url === '/redirect-ssrf') {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
        res.end();
      } else if (req.url === '/redirect-loop') {
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/redirect-loop` });
        res.end();
      } else if (req.url === '/redirect-valid') {
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/image.png` });
        res.end();
      } else if (req.url === '/image.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });

  try {
    const config = {
      domains: ['127.0.0.1'],
      remotePatterns: [],
      deviceSizes: [640, 750],
      imageSizes: [16, 32],
      formats: ['image/webp'],
      minimumCacheTTL: 60,
      dangerouslyAllowSVG: false,
      contentDispositionType: 'inline',
    };

    // 1. SSRF redirect to internal metadata IP (169.254.169.254) must be blocked
    await assert.rejects(
      async () => fetchRemoteImage(`http://127.0.0.1:${port}/redirect-ssrf`, config),
      /Redirect target not allowed by image configuration/
    );

    // 2. Infinite redirect loop must be bounded by maxRedirects
    await assert.rejects(
      async () => fetchRemoteImage(`http://127.0.0.1:${port}/redirect-loop`, config, 3),
      /Too many redirects fetching remote image/
    );

    // 3. Valid redirect to an allowed host must succeed
    const buffer = await fetchRemoteImage(`http://127.0.0.1:${port}/redirect-valid`, config);
    assert.ok(buffer);
    assert.equal(buffer[0], 0x89);
    assert.equal(buffer[1], 0x50);
  } finally {
    server.close();
  }
});
