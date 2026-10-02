#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');

const routesPath = path.join(__dirname, '../../dist/metadata/routes.js');

describe('metadata route helpers', () => {
  it('serializes robots.txt and sitemap.xml', () => {
    const { serializeRobots, serializeSitemap, robots, sitemap, manifest } = require(routesPath);

    const robotsBody = serializeRobots({
      rules: { userAgent: '*', allow: '/', disallow: '/private' },
      sitemap: 'https://example.com/sitemap.xml',
      host: 'example.com',
    });
    assert.match(robotsBody, /User-agent: \*/);
    assert.match(robotsBody, /Allow: \//);
    assert.match(robotsBody, /Disallow: \/private/);
    assert.match(robotsBody, /Sitemap: https:\/\/example.com\/sitemap.xml/);

    const xml = serializeSitemap([
      { url: 'https://example.com', lastModified: '2026-01-01', changeFrequency: 'weekly', priority: 1 },
    ]);
    assert.match(xml, /<loc>https:\/\/example.com<\/loc>/);
    assert.match(xml, /<changefreq>weekly<\/changefreq>/);

    assert.equal(robots({ rules: { userAgent: '*', allow: '/' } }).headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(sitemap([{ url: 'https://example.com' }]).headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.equal(manifest({ name: 'App' }).headers.get('content-type'), 'application/manifest+json; charset=utf-8');
  });
});
