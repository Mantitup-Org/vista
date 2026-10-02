/**
 * Runs a real vista/ai agent stream for the marketing playground.
 * Used by Flashpack POST /_flashpack/agent-playground (and readable as a CLI).
 *
 * Prefers the model from the request when the matching API key exists.
 * Otherwise falls back to OpenRouter / GROQ / OpenAI / NVIDIA env, then mock:echo.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { stdin as input } from 'node:process';

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return '';
  return process.argv[index + 1];
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of input) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function providerOf(model) {
  const colon = String(model || '').indexOf(':');
  return colon === -1 ? '' : model.slice(0, colon).toLowerCase();
}

function hasKeyFor(model) {
  const provider = providerOf(model);
  if (provider === 'mock') return true;
  if (provider === 'openrouter') return Boolean(process.env.OPENROUTER_API_KEY);
  if (provider === 'groq') return Boolean(process.env.GROQ_API_KEY);
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (provider === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === 'gemini') return Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
  if (provider === 'nvidia' || provider === 'nim') {
    return Boolean(process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY);
  }
  if (provider === 'ollama') return true;
  return false;
}

function pickModel(requested) {
  if (requested && hasKeyFor(requested)) return { model: requested, mode: requested.startsWith('mock:') ? 'demo' : 'live' };
  if (process.env.OPENROUTER_API_KEY) {
    return {
      model: process.env.VISTA_AI_MODEL || 'openrouter:openai/gpt-4o-mini',
      mode: 'live',
    };
  }
  if (process.env.GROQ_API_KEY) return { model: 'groq:llama-3.1-8b-instant', mode: 'live' };
  if (process.env.OPENAI_API_KEY) return { model: 'openai:gpt-4o-mini', mode: 'live' };
  if (process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY) {
    return { model: 'nvidia:meta/llama-3.1-8b-instruct', mode: 'live' };
  }
  if (process.env.ANTHROPIC_API_KEY) return { model: 'anthropic:claude-3-5-haiku-latest', mode: 'live' };
  return { model: 'mock:echo', mode: 'demo' };
}

const cwd = path.resolve(readArg('--cwd') || process.cwd());
loadEnvFile(path.join(cwd, '.env'));
loadEnvFile(path.join(cwd, '.env.local'));
const raw = await readStdin();
let body = {};
try {
  body = raw.trim() ? JSON.parse(raw) : {};
} catch {
  process.stderr.write('invalid json body\n');
  process.exit(1);
}

const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
if (!prompt) {
  process.stderr.write('prompt is required\n');
  process.exit(1);
}

const name = typeof body.name === 'string' && body.name ? body.name : 'support';
const systemPrompt =
  typeof body.systemPrompt === 'string' && body.systemPrompt
    ? body.systemPrompt
    : 'You help ship Vista apps. Keep answers short and practical.';
const requestedModel =
  typeof body.model === 'string' && body.model
    ? body.model
    : process.env.VISTA_AI_MODEL || '';
const { model, mode } = pickModel(requestedModel);

const require = createRequire(path.join(cwd, 'package.json'));
const { agent } = require('vista/ai');

const playgroundAgent = agent({
  name,
  model,
  systemPrompt,
  memory: false,
  maxSteps: 3,
});

process.stdout.write(`meta: ${JSON.stringify({ mode, model, name })}\n`);

const stream = playgroundAgent.stream({ prompt, sessionId: body.sessionId });
try {
  for await (const chunk of stream) {
    process.stdout.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  process.stdout.write('data: [DONE]\n\n');
} catch (error) {
  const message = error?.message || String(error);
  process.stdout.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
  process.exitCode = 1;
}
