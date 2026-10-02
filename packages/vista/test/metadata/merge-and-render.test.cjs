#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');

const mergePath = path.join(__dirname, '../../dist/metadata/merge.js');
const generatePath = path.join(__dirname, '../../dist/metadata/generate.js');

describe('deepMergeMetadata', () => {
  it('deep-merges openGraph and inherits title template', () => {
    const { deepMergeMetadata } = require(mergePath);
    const parent = {
      title: { default: 'Vista', template: '%s | Vista' },
      openGraph: { siteName: 'Vista', type: 'website' },
      robots: { index: true, follow: true },
    };
    const child = {
      title: 'Docs',
      description: 'Guide',
      openGraph: { title: 'Docs', images: '/og.png' },
      robots: { googleBot: { index: true, 'max-snippet': -1 } },
    };
    const merged = deepMergeMetadata(parent, child);
    assert.equal(merged.title.default, 'Docs');
    assert.equal(merged.title.template, '%s | Vista');
    assert.equal(merged.openGraph.siteName, 'Vista');
    assert.equal(merged.openGraph.title, 'Docs');
    assert.equal(merged.robots.index, true);
    assert.equal(merged.robots.googleBot['max-snippet'], -1);
  });
});

describe('generateMetadataHtml', () => {
  it('emits other, object googleBot, and theme-color', () => {
    const { generateMetadataHtml } = require(generatePath);
    const html = generateMetadataHtml({
      title: { default: 'Home', template: '%s | Vista' },
      description: 'Hello',
      robots: {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
      },
      other: { 'theme-color': '#111111' },
      appleWebApp: { capable: true, title: 'Vista' },
      formatDetection: { telephone: false },
      alternates: { canonical: '/docs' },
      metadataBase: 'https://example.com',
    });
    assert.match(html, /<title>Home \| Vista<\/title>/);
    assert.match(html, /name="description" content="Hello"/);
    assert.match(html, /name="googlebot"[^>]*max-image-preview:large/);
    assert.match(html, /name="theme-color" content="#111111"/);
    assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(html, /name="format-detection" content="telephone=no"/);
    assert.match(html, /rel="canonical" href="https:\/\/example.com\/docs"/);
  });
});
