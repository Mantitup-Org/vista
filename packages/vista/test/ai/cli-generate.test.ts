import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runGenerateCommand } from '../../src/bin/generate';

function makeTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vista-ai-generate-'));
}

test('agent generator creates agent file and streaming route handler', async () => {
  const cwd = makeTempWorkspace();
  const logs: string[] = [];
  const errors: string[] = [];

  try {
    const exitCode = await runGenerateCommand(['agent', 'support'], {
      cwd,
      log: (msg) => logs.push(msg),
      error: (msg) => errors.push(msg),
    });

    assert.equal(exitCode, 0);

    const agentPath = path.join(cwd, 'app', 'agents', 'support', 'agent.ts');
    const routePath = path.join(cwd, 'app', 'api', 'agents', 'support', 'route.ts');

    assert.equal(fs.existsSync(agentPath), true);
    assert.equal(fs.existsSync(routePath), true);

    const agentSource = fs.readFileSync(agentPath, 'utf8');
    assert.match(agentSource, /agent\(\{/);
    assert.match(agentSource, /supportAgent = agent/);

    const routeSource = fs.readFileSync(routePath, 'utf8');
    assert.match(routeSource, /export async function POST/);
    assert.match(routeSource, /supportAgent\.stream/);
    assert.match(routeSource, /stream\.toDataStreamResponse\(\)/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
