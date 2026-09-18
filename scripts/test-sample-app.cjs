#!/usr/bin/env node

const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const sampleRoot = path.join(repoRoot, 'sample-app');
const vistaBin = path.join(repoRoot, 'packages', 'vista', 'bin', 'vista.js');
const port = 3003;
const origin = `http://127.0.0.1:${port}`;

function request(pathname, options) {
  return fetch(`${origin}${pathname}`, options);
}

async function waitForServer(child) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Sample server exited with code ${child.exitCode}`);
    }

    try {
      const response = await request('/');
      if (response.status === 200) return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Sample server did not become ready: ${lastError || 'timeout'}`);
}

async function expectPageContains(text, expected) {
  const response = await request('/');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes(expected), `Expected page to contain ${text}: ${expected}`);
}

async function main() {
  assert.ok(fs.existsSync(path.join(sampleRoot, 'app', 'api', 'notes', 'route.ts')));
  fs.rmSync(path.join(sampleRoot, '.vista'), { recursive: true, force: true });
  execFileSync(process.execPath, [vistaBin, 'build'], {
    cwd: sampleRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const child = spawn(process.execPath, [vistaBin, 'start'], {
    cwd: sampleRoot,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'pipe',
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(child);
    await expectPageContains('initial note', 'First note');
    await expectPageContains('endpoint link', '/api/notes/1');

    const initial = await (await request('/api/notes')).json();
    assert.ok(initial.notes.some((note) => note.title === 'First note'));

    const uniqueTitle = 'Integration note created through the API';
    const uniqueBody = 'created through the notes API';
    const createdResponse = await request('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: uniqueTitle, body: uniqueBody }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).note;

    const afterCreate = await (await request('/api/notes')).json();
    assert.ok(afterCreate.notes.some((note) => note.id === created.id));
    await expectPageContains('created note', uniqueTitle);

    const updatedTitle = `${uniqueTitle} updated`;
    const updatedBody = 'updated through the notes API';
    const patchedResponse = await request(`/api/notes/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: updatedTitle, body: updatedBody }),
    });
    assert.equal(patchedResponse.status, 200);
    await expectPageContains('updated note', updatedTitle);
    await expectPageContains('updated note body', updatedBody);

    const deletedResponse = await request(`/api/notes/${created.id}`, { method: 'DELETE' });
    assert.equal(deletedResponse.status, 204);
    const afterDelete = await (await request('/')).text();
    assert.ok(!afterDelete.includes(updatedTitle), 'Deleted note remained on the rendered page');
    assert.ok(
      !afterDelete.includes(updatedBody),
      'Deleted note body remained on the rendered page'
    );

    console.log('Sample app mutation-to-page verification passed.');
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    if (child.exitCode === null) {
      child.kill();
      if (process.platform === 'win32') {
        try {
          execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
        } catch {}
      }
    }
  }
}

main().catch((error) => {
  console.error('Sample app mutation-to-page verification failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
