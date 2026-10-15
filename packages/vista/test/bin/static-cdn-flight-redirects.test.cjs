#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { prepareStaticCdnOutput } = require('../../dist/deploy/utils');

// prepareStaticCdnOutput(target) scans `target/static/pages` and writes the
// flattened output + `_redirects` into `target`. So the fixture pages must be
// placed under `<target>/static/pages`, and the SAME dir is the target.
function makePagesDir(target) {
  const pages = path.join(target, 'static', 'pages');
  fs.mkdirSync(path.join(pages, 'blog'), { recursive: true });
  fs.writeFileSync(path.join(pages, 'index.rsc'), '0:flight-index');
  fs.writeFileSync(path.join(pages, 'docs.rsc'), '0:flight-docs');
  fs.writeFileSync(path.join(pages, 'blog', 'post.rsc'), '0:flight-blog-post');
  return pages;
}

test('prepareStaticCdnOutput emits .rsc identity rewrites so Flight never falls through to HTML', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-flight-'));
  try {
    makePagesDir(target);

    prepareStaticCdnOutput(target);
    const redirects = fs
      .readFileSync(path.join(target, '_redirects'), 'utf8')
      .split('\n')
      .filter(Boolean);

    // Extensionless `/rsc/foo` aliases must map to the `.rsc` file.
    assert.ok(
      redirects.includes('/rsc/docs /rsc/docs.rsc 200'),
      'missing extensionless /rsc/docs alias'
    );
    assert.ok(
      redirects.includes('/rsc/blog/post /rsc/blog/post.rsc 200'),
      'missing nested /rsc/blog/post alias'
    );

    // The `.rsc` URL itself must be an identity rewrite, otherwise the
    // `^/(.+)$` -> `.html` catch-all rewrites Flight to HTML.
    assert.ok(
      redirects.includes('/rsc/docs.rsc /rsc/docs.rsc 200'),
      'missing /rsc/docs.rsc identity rewrite'
    );
    assert.ok(
      redirects.includes('/rsc/blog/post.rsc /rsc/blog/post.rsc 200'),
      'missing /rsc/blog/post.rsc identity rewrite'
    );

    // The root index Flight file must ALSO get an identity rewrite — this was
    // the gap the reviewer caught: without it `/rsc/index.rsc` falls through
    // to the HTML catch-all.
    assert.ok(
      redirects.includes('/rsc/index.rsc /rsc/index.rsc 200'),
      'missing /rsc/index.rsc identity rewrite'
    );

    // Root index extensionless aliases.
    assert.ok(redirects.includes('/rsc /rsc/index.rsc 200'));
    assert.ok(redirects.includes('/rsc/ /rsc/index.rsc 200'));

    // Identity rewrites must precede the extensionless aliases so Cloudflare
    // Pages (first-match-wins) serves the `.rsc` URL verbatim.
    const idxIdentity = redirects.indexOf('/rsc/docs.rsc /rsc/docs.rsc 200');
    const idxAlias = redirects.indexOf('/rsc/docs /rsc/docs.rsc 200');
    assert.ok(idxIdentity !== -1 && idxAlias !== -1, 'both rules must exist');
    assert.ok(
      idxIdentity < idxAlias,
      'identity rewrite must come before the extensionless alias'
    );

    // No duplicate lines.
    assert.equal(new Set(redirects).size, redirects.length);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
