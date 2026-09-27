#!/usr/bin/env node

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { generateMetadataHtml } = require('../../dist/metadata/generate');

test('invalid metadataBase does not throw and keeps relative URLs as-is', () => {
  // metadataBase without a scheme (e.g. "example.com") is a common mistake.
  // Before the fix this made generateMetadataHtml throw ERR_INVALID_URL,
  // wiping the whole <head> metadata (or failing the RSC render).
  const html = generateMetadataHtml({
    title: 'Shop',
    openGraph: { url: '/products', images: ['/cover.png'] },
    alternates: { canonical: '/home' },
    metadataBase: 'example.com',
  });
  assert.ok(html.includes('<title>Shop</title>'), `title missing: ${html}`);
  assert.ok(html.includes('content="/products"'), `og:url not raw: ${html}`);
  assert.ok(html.includes('content="/cover.png"'), `og:image not raw: ${html}`);
  assert.ok(html.includes('href="/home"'), `canonical not raw: ${html}`);
});

test('valid metadataBase still resolves relative URLs', () => {
  const html = generateMetadataHtml({
    openGraph: { url: '/products' },
    alternates: { canonical: '/home' },
    metadataBase: 'https://example.com',
  });
  assert.ok(
    html.includes('content="https://example.com/products"'),
    `og:url not resolved: ${html}`
  );
  assert.ok(
    html.includes('href="https://example.com/home"'),
    `canonical not resolved: ${html}`
  );
});

test('malformed absolute-looking urls are returned verbatim', () => {
  // Absolute-looking values never go through the URL constructor, so a
  // malformed authority must not fail the render either.
  const html = generateMetadataHtml({
    openGraph: { url: 'https://' },
    metadataBase: 'https://example.com',
  });
  assert.ok(html.includes('content="https://"'), `og:url mangled: ${html}`);
});
