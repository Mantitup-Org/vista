const assert = require('node:assert/strict');
const { test } = require('node:test');

const { isAllowedRemoteUrl } = require('../../dist/server/image-optimizer');

test('isAllowedRemoteUrl matches literal dots and rejects lookalike hosts (#131)', () => {
  const config = {
    domains: [],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.example.com',
      },
    ],
  };

  // Exact match must pass
  assert.equal(isAllowedRemoteUrl('https://cdn.example.com/photo.jpg', config), true);

  // Lookalike hosts must be rejected (not treated as . wildcard)
  assert.equal(isAllowedRemoteUrl('https://cdn-example.com/photo.jpg', config), false);
  assert.equal(isAllowedRemoteUrl('https://cdnXexampleYcom/photo.jpg', config), false);
  assert.equal(isAllowedRemoteUrl('https://cdn1example2com/photo.jpg', config), false);
  assert.equal(isAllowedRemoteUrl('https://evil.cdn.example.com/photo.jpg', config), false);
});

test('isAllowedRemoteUrl still correctly handles wildcard subdomains with literal dots', () => {
  const config = {
    domains: [],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.example.com',
      },
    ],
  };

  // Subdomain matches
  assert.equal(isAllowedRemoteUrl('https://images.example.com/photo.jpg', config), true);
  assert.equal(isAllowedRemoteUrl('https://assets.cdn.example.com/photo.jpg', config), true);

  // Domain typo must fail
  assert.equal(isAllowedRemoteUrl('https://images.example-com/photo.jpg', config), false);
});
