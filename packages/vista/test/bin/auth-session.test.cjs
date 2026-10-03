#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { runGenerateCommand } = require('../../dist/bin/generate');

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vista-auth-session-'));
}

function writeRoot(cwd, source) {
  const appDir = path.join(cwd, 'app');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'root.tsx'), source, 'utf8');
}

test('vista g auth wires AuthSessionProvider into single-line ThemeProvider root', async () => {
  const cwd = makeTempWorkspace();
  try {
    writeRoot(
      cwd,
      [
        "import { ThemeProvider } from 'vista/theme';",
        '',
        'export default function RootLayout({ children }: { children: React.ReactNode }) {',
        '  return (',
        '    <html lang="en">',
        '      <body>',
        '        <ThemeProvider attribute="class">{children}</ThemeProvider>',
        '      </body>',
        '    </html>',
        '  );',
        '}',
        '',
      ].join('\n')
    );

    const code = await runGenerateCommand(['auth'], { cwd, log: () => {} });
    assert.equal(code, 0);

    const updated = fs.readFileSync(path.join(cwd, 'app', 'root.tsx'), 'utf8');
    assert.match(updated, /<AuthSessionProvider>/);
    assert.match(updated, /<\/AuthSessionProvider>/);
    assert.match(updated, /from '\.\.\/components\/auth-session-provider'/);
    // Provider wraps {children} inside ThemeProvider, preserving the ThemeProvider wrapper.
    assert.match(updated, /<ThemeProvider[^>]*><AuthSessionProvider>\{children\}<\/AuthSessionProvider><\/ThemeProvider>/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('vista g auth wires AuthSessionProvider into multiline ThemeProvider root', async () => {
  const cwd = makeTempWorkspace();
  try {
    writeRoot(
      cwd,
      [
        "import { ThemeProvider } from 'vista/theme';",
        '',
        'export default function RootLayout({ children }: { children: React.ReactNode }) {',
        '  return (',
        '    <html lang="en">',
        '      <body>',
        '        <ThemeProvider attribute="class">',
        '          {children}',
        '        </ThemeProvider>',
        '      </body>',
        '    </html>',
        '  );',
        '}',
        '',
      ].join('\n')
    );

    const code = await runGenerateCommand(['auth'], { cwd, log: () => {} });
    assert.equal(code, 0);

    const updated = fs.readFileSync(path.join(cwd, 'app', 'root.tsx'), 'utf8');
    assert.match(updated, /<AuthSessionProvider>/);
    assert.match(updated, /<\/AuthSessionProvider>/);
    assert.match(updated, /from '\.\.\/components\/auth-session-provider'/);
    // The {children} must now be wrapped, even though ThemeProvider spans multiple lines.
    assert.match(updated, /<AuthSessionProvider>[\s\S]*\{children\}[\s\S]*<\/AuthSessionProvider>/);
    // The opening and closing ThemeProvider tags must still be present and balanced.
    assert.ok(updated.includes('<ThemeProvider'));
    assert.ok(updated.includes('</ThemeProvider>'));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('vista g auth wires AuthSessionProvider into body when no ThemeProvider', async () => {
  const cwd = makeTempWorkspace();
  try {
    writeRoot(
      cwd,
      [
        'export default function RootLayout({ children }: { children: React.ReactNode }) {',
        '  return (',
        '    <html lang="en">',
        '      <body>{children}</body>',
        '    </html>',
        '  );',
        '}',
        '',
      ].join('\n')
    );

    const code = await runGenerateCommand(['auth'], { cwd, log: () => {} });
    assert.equal(code, 0);

    const updated = fs.readFileSync(path.join(cwd, 'app', 'root.tsx'), 'utf8');
    assert.match(updated, /<AuthSessionProvider>/);
    assert.match(updated, /<\/AuthSessionProvider>/);
    assert.match(updated, /from '\.\.\/components\/auth-session-provider'/);
    // Provider must be inserted inside <body>, wrapping {children}.
    assert.match(updated, /<body[^>]*><AuthSessionProvider>\{children\}<\/AuthSessionProvider>/);
    // No ThemeProvider was present, so none should have been introduced.
    assert.doesNotMatch(updated, /<ThemeProvider/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('vista g auth is idempotent on already-wired root', async () => {
  const cwd = makeTempWorkspace();
  try {
    writeRoot(
      cwd,
      [
        "import { ThemeProvider } from 'vista/theme';",
        "import { AuthSessionProvider } from '../components/auth-session-provider';",
        '',
        'export default function RootLayout({ children }: { children: React.ReactNode }) {',
        '  return (',
        '    <html lang="en">',
        '      <body>',
        '        <ThemeProvider attribute="class"><AuthSessionProvider>{children}</AuthSessionProvider></ThemeProvider>',
        '      </body>',
        '    </html>',
        '  );',
        '}',
        '',
      ].join('\n')
    );

    const before = fs.readFileSync(path.join(cwd, 'app', 'root.tsx'), 'utf8');
    const code = await runGenerateCommand(['auth'], { cwd, log: () => {} });
    assert.equal(code, 0);
    const after = fs.readFileSync(path.join(cwd, 'app', 'root.tsx'), 'utf8');
    assert.equal(after, before, 'root.tsx must be unchanged when AuthSessionProvider already present');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
