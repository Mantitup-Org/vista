"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverAgents = discoverAgents;
exports.tryHandleAgentRequest = tryHandleAgentRequest;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const agent_1 = require("./agent");
const AGENT_FILENAMES = ['agent.ts', 'agent.tsx', 'agent.js', 'agent.jsx', 'index.ts', 'index.js'];
function collectAgentFiles(dir, results) {
    if (!fs_1.default.existsSync(dir))
        return;
    let entries;
    try {
        entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules')
            continue;
        const fullPath = path_1.default.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectAgentFiles(fullPath, results);
            continue;
        }
        if (entry.isFile() && AGENT_FILENAMES.includes(entry.name)) {
            results.push(fullPath);
        }
    }
}
function loadAgentFromModule(filePath, fallbackName) {
    const mod = require(filePath);
    const candidates = [mod.default, mod.agent, ...Object.values(mod)];
    for (const candidate of candidates) {
        if (candidate instanceof agent_1.Agent) {
            return candidate;
        }
    }
    const config = mod.default || mod.agent || mod.supportAgent;
    if (config && typeof config === 'object' && config.model && (config.name || fallbackName)) {
        const { agent } = require('./agent');
        return agent({
            ...config,
            name: config.name || fallbackName,
        });
    }
    return null;
}
function discoverAgents(cwd) {
    const roots = [
        path_1.default.resolve(cwd, 'app', 'agents'),
        path_1.default.resolve(cwd, 'src', 'app', 'agents'),
    ];
    const files = [];
    for (const root of roots) {
        collectAgentFiles(root, files);
    }
    const agents = [];
    const seen = new Set();
    for (const filePath of files) {
        const fallbackName = path_1.default.basename(path_1.default.dirname(filePath));
        try {
            const loaded = loadAgentFromModule(filePath, fallbackName);
            if (!loaded || seen.has(loaded.name))
                continue;
            seen.add(loaded.name);
            agents.push({ name: loaded.name, filePath, agent: loaded });
        }
        catch (error) {
            console.error(`[vista:ai] Failed to load agent from ${filePath}:`, error?.message || error);
        }
    }
    return agents;
}
function matchAgentRequest(pathname) {
    const match = pathname.match(/^\/api\/agents\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
}
async function tryHandleAgentRequest(req, res, cwd, isDev) {
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
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    let payload = {};
    if (chunks.length > 0) {
        try {
            payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        }
        catch {
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
    }
    catch (error) {
        res.status(500).json({ error: error?.message || 'Agent execution failed' });
        return true;
    }
}
