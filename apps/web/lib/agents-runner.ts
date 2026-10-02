export type AgentsRunResult =
  | {
      ok: true;
      meta: string;
      mode: 'live' | 'demo';
      model: string;
      chunks: string[];
      text: string;
    }
  | {
      ok: false;
      error: string;
      meta?: string;
    };

function readStringField(source: string, field: string): string | null {
  const re = new RegExp(`${field}\\s*:\\s*['\`]([^'\`]+)['\`]`);
  const match = source.match(re);
  return match?.[1] ?? null;
}

async function consumeAgentSse(
  response: Response,
  onChunk?: (partial: string) => void
): Promise<AgentsRunResult> {
  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '');
    return {
      ok: false,
      error: errText || `Request failed (${response.status})`,
      meta: 'agent playground',
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const chunks: string[] = [];
  let mode: 'live' | 'demo' = 'live';
  let model = response.headers.get('X-Vista-Playground-Model') || 'unknown';
  let name = 'support';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('meta: ')) {
        try {
          const meta = JSON.parse(trimmed.slice(6)) as {
            mode?: 'live' | 'demo';
            model?: string;
            name?: string;
          };
          if (meta.mode === 'live' || meta.mode === 'demo') mode = meta.mode;
          if (meta.model) model = meta.model;
          if (meta.name) name = meta.name;
        } catch {
          // ignore partial meta
        }
        continue;
      }

      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') continue;

      try {
        const chunk = JSON.parse(payload) as {
          type?: string;
          textDelta?: string;
          error?: string;
        };
        if (chunk.type === 'error' && chunk.error) {
          return { ok: false, error: chunk.error, meta: `${mode} · ${model}` };
        }
        if (chunk.type === 'text-delta' && chunk.textDelta) {
          text += chunk.textDelta;
          chunks.push(chunk.textDelta);
          onChunk?.(text);
        }
      } catch {
        // ignore partial JSON
      }
    }
  }

  if (!text.trim()) {
    return {
      ok: false,
      error:
        mode === 'demo'
          ? 'Demo model returned an empty reply. Set GROQ_API_KEY (or OPENAI_API_KEY) in apps/web/.env for a live model.'
          : 'Model returned an empty reply.',
      meta: `${mode} · ${model}`,
    };
  }

  return {
    ok: true,
    mode,
    model,
    meta: `${mode === 'live' ? 'live' : 'demo'} · POST /api/agents/${name} · ${model}`,
    chunks,
    text,
  };
}

/** Prefer a real vista/ai stream; fall back only if the server endpoint is unavailable. */
export async function runAgentPlayground(options: {
  agentSource: string;
  routeSource: string;
  prompt: string;
  onChunk?: (partial: string) => void;
}): Promise<AgentsRunResult> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    return { ok: false, error: 'Enter a prompt, then Run.', meta: 'agent playground' };
  }

  if (!/agent\s*\(/.test(options.agentSource)) {
    return {
      ok: false,
      error: 'agent.ts must call agent({ ... }).',
      meta: 'parse agent',
    };
  }

  if (!/\.stream\s*\(/.test(options.routeSource) || !/toDataStreamResponse/.test(options.routeSource)) {
    return {
      ok: false,
      error: 'route.ts must call agent.stream(...).toDataStreamResponse().',
      meta: 'parse route',
    };
  }

  const name = readStringField(options.agentSource, 'name') ?? 'support';
  const model =
    readStringField(options.agentSource, 'model') ?? 'openrouter:openai/gpt-4o-mini';
  const systemPrompt =
    readStringField(options.agentSource, 'systemPrompt') ?? 'You help ship Vista apps.';

  const payload = JSON.stringify({ prompt, name, model, systemPrompt });
  const endpoints = ['/api/playground/agent', '/_flashpack/agent-playground'];

  let lastError = 'Agent playground endpoint unavailable.';
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      });
      if (response.status === 404 || response.status === 405) {
        lastError = `${endpoint} returned ${response.status}`;
        continue;
      }
      return await consumeAgentSse(response, options.onChunk);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    ok: false,
    error: `${lastError} Restart \`pnpm --filter web dev\`, and ensure apps/web/.env has OPENROUTER_API_KEY (or another provider key).`,
    meta: 'agent playground',
  };
}
