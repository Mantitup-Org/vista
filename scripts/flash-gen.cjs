#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const REPO_ROOT = path.resolve(__dirname, '..');

function toFileName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function parseArgs(argv) {
  const args = { mode: argv[0] || '', values: {}, positionals: [] };
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args.values[key] = val;
      continue;
    }
    args.positionals.push(token);
  }

  if (!args.values.name && args.positionals[0]) args.values.name = args.positionals[0];
  if (!args.values.type && args.positionals[1]) args.values.type = args.positionals[1];
  if (!args.values.title && args.positionals[1]) args.values.title = args.positionals[1];
  if (!args.values.summary && args.positionals[2]) args.values.summary = args.positionals[2];
  if (!args.values.fix && args.positionals[3]) args.values.fix = args.positionals[3];

  return args;
}

function ask(rl, prompt, fallback) {
  if (fallback && String(fallback).trim().length > 0) {
    return Promise.resolve(String(fallback));
  }
  return new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer.trim())));
}

async function runTestGenerator(values) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const nameRaw = await ask(rl, 'Test name: ', values.name);
    const typeRaw = await ask(rl, 'Test type (unit/e2e) [unit]: ', values.type || 'unit');
    const name = toFileName(nameRaw);
    const type = String(typeRaw || 'unit').toLowerCase() === 'e2e' ? 'e2e' : 'unit';

    if (!name) {
      throw new Error('Test name is required.');
    }

    const relPath =
      type === 'e2e'
        ? `packages/vista/test/server/${name}.test.ts`
        : `packages/vista/test/stack/${name}.test.ts`;
    const absPath = path.join(REPO_ROOT, relPath);
    ensureDir(absPath);
    const body = `describe('${name}', () => {\n  it('should work', () => {\n    expect(true).toBe(true);\n  });\n});\n`;
    fs.writeFileSync(absPath, body, 'utf8');
    console.log(`Created ${relPath}`);
  } finally {
    rl.close();
  }
}

async function runErrorGenerator(values) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const nameRaw = await ask(rl, 'Error slug: ', values.name);
    const titleRaw = await ask(rl, 'Error title: ', values.title);
    const summaryRaw = await ask(rl, 'Short summary: ', values.summary);
    const fixRaw = await ask(rl, 'How to fix: ', values.fix);

    const name = toFileName(nameRaw);
    if (!name || !titleRaw || !summaryRaw || !fixRaw) {
      throw new Error('name, title, summary, and fix are required.');
    }

    const relPath = `apps/web/content/docs/reference/errors-${name}.md`;
    const absPath = path.join(REPO_ROOT, relPath);
    ensureDir(absPath);
    const body = `---\ncategory: "reference"\nslug: "errors-${name}"\ntitle: "${titleRaw}"\nsummary: "${summaryRaw}"\norder: 999\nupdatedAt: "2026-03-20"\n---\n\n## Why This Happens\n\n${summaryRaw}\n\n## How To Fix\n\n- ${fixRaw}\n`;
    fs.writeFileSync(absPath, body, 'utf8');
    console.log(`Created ${relPath}`);
  } finally {
    rl.close();
  }
}

async function main() {
  const { mode, values } = parseArgs(process.argv.slice(2));
  if (mode === 'test') {
    await runTestGenerator(values);
    return;
  }
  if (mode === 'error') {
    await runErrorGenerator(values);
    return;
  }

  console.error('Usage: node scripts/flash-gen.cjs <test|error> [--name ...]');
  process.exit(1);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
