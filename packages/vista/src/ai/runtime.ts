import fs from 'fs';
import path from 'path';
import type express from 'express';
import { Agent } from './agent';

const AGENT_FILENAMES = ['agent.ts', 'agent.tsx', 'agent.js', 'agent.jsx', 'index.ts', 'index.js'];

export type DiscoveredAgent = {
  name: string;
  filePath: string;
  agent: Agent;
};

function collectAgentFiles(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectAgentFiles(fullPath, results);
      continue;
    }
    if (entry.isFile() && AGENT_FILENAMES.includes(entry.name)) {
      results.push(fullPath);
    }
  }
}

function loadAgentFromModule(filePath: string, fallbackName: string): Agent | null {
  const mod = require(filePath);
  const candidates = [mod.default, mod.agent, ...Object.values(mod)];
  for (const candidate of candidates) {
    if (candidate instanceof Agent) {
      return candidate;
    }
  }

  const config = mod.default || mod.agent || mod.supportAgent;
  if (config && typeof config === 'object' && config.model && (config.name || fallbackName)) {
    const { agent } = require('./agent') as typeof import('./agent');
    return agent({
      ...config,
      name: config.name || fallbackName,
    });
  }

  return null;
}

export function discoverAgents(cwd: string): DiscoveredAgent[] {
  const roots = [
    path.resolve(cwd, 'app', 'agents'),
    path.resolve(cwd, 'src', 'app', 'agents'),
  ];
  const files: string[] = [];
  for (const root of roots) {
    collectAgentFiles(root, files);
  }

  const agents: DiscoveredAgent[] = [];
  const seen = new Set<string>();

  for (const filePath of files) {
    const fallbackName = path.basename(path.dirname(filePath));
    try {
      const loaded = loadAgentFromModule(filePath, fallbackName);
      if (!loaded || seen.has(loaded.name)) continue;
      seen.add(loaded.name);
      agents.push({ name: loaded.name, filePath, agent: loaded });
    } catch (error) {
      console.error(`[vista:ai] Failed to load agent from ${filePath}:`, (error as Error)?.message || error);
    }
  }

  return agents;
}

function matchAgentRequest(pathname: string): string | null {
  const match = pathname.match(/^\/api\/agents\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function tryHandleAgentRequest(
  req: express.Request,
  res: express.Response,
  cwd: string,
  isDev: boolean
): Promise<boolean> {
  const agentName = matchAgentRequest(req.path);
  if (!agentName) {
    if (req.path === '/api/agents' && req.method === 'GET') {
      const agents = discoverAgents(cwd).map((entry) => ({
        name: entry.agent.name,
        model: typeof entry.agent.model === 'string' ? entry.agent.model : entry.agent.model.id,
        tools: entry.agent.tools.map((tool) => tool.name),
      }));
      res.status(200).json({ agents });
      return true;
    }
    return false;
  }

  if (isDev) {
    for (const key of Object.keys(require.cache)) {
      if (key.replace(/\\/g, '/').includes('/agents/')) {
        delete require.cache[key];
      }
    }
  }

  const discovered = discoverAgents(cwd).find((entry) => entry.name === agentName);
  if (!discovered) {
    res.status(404).json({ error: `Agent "${agentName}" not found` });
    return true;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      name: discovered.agent.name,
      model: typeof discovered.agent.model === 'string' ? discovered.agent.model : discovered.agent.model.id,
      tools: discovered.agent.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
    });
    return true;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return true;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  let payload: any = {};
  if (chunks.length > 0) {
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return true;
    }
  }

  try {
    if (payload.stream) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      for await (const event of discovered.agent.stream({
        input: payload.input,
        messages: payload.messages,
        sessionId: payload.sessionId,
      })) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.end();
      return true;
    }

    const result = await discovered.agent.generate({
      input: payload.input,
      messages: payload.messages,
      sessionId: payload.sessionId,
    });
    res.status(200).json(result);
    return true;
  } catch (error) {
    res.status(500).json({ error: (error as Error)?.message || 'Agent execution failed' });
    return true;
  }
}
