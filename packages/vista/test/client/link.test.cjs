#!/usr/bin/env node

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const React = require('react');
const ReactDOMServer = require('react-dom/server');

const { Link, useIsActive } = require('../../dist/client/link.js');
const { RouterContext } = require('../../dist/client/router.js');

test('Link renders download attribute without modification', () => {
  const html = ReactDOMServer.renderToString(
    React.createElement(
      Link,
      { href: '/assets/whitepaper.pdf', download: 'whitepaper.pdf' },
      'Download PDF'
    )
  );

  assert(html.includes('href="/assets/whitepaper.pdf"'));
  assert(html.includes('download="whitepaper.pdf"'));
  assert(html.includes('>Download PDF</a>'));
});

test('Link preserves frame targets like _top, _parent, and custom targets', () => {
  const targets = ['_blank', '_top', '_parent', 'workspace-frame'];

  for (const target of targets) {
    const html = ReactDOMServer.renderToString(
      React.createElement(
        Link,
        { href: '/external-embed', target },
        'Open Frame'
      )
    );
    assert(html.includes(`target="${target}"`), `Failed to preserve target ${target}`);
  }
});

test('Link formats Url object with query and hash parameters correctly', () => {
  const html = ReactDOMServer.renderToString(
    React.createElement(
      Link,
      {
        href: {
          href: '/projects',
          query: { filter: 'active', sort: 'desc' },
          hash: 'details',
        },
      },
      'Projects'
    )
  );

  assert(html.includes('href="/projects?filter=active&amp;sort=desc#details"'));
});

test('Link source handles same-page hash and download navigation checks', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.join(__dirname, '../../src/client/link.tsx'), 'utf8');

  // Verify non-self targets are passed through natively
  assert(
    source.includes("target && target !== '_self'"),
    'Link must bypass preventDefault for any non-_self target'
  );

  // Verify download attribute is checked
  assert(
    source.includes('props.download != null && props.download !== false'),
    'Link must bypass preventDefault when download attribute is present'
  );

  // Verify same-page hash detection
  assert(
    source.includes("targetHash !== undefined && (targetBase === '' || targetBase === pathname)"),
    'Link must allow native scroll for same-page hash links'
  );

  // Verify query/hash-aware active state comparison
  assert(
    source.includes("targetPath.split(/[?#]/)[0]"),
    'Link must compare base pathname for active state matching'
  );
});
