import { agent } from 'vista/ai';

export const runtime = 'nodejs';

function providerOf(model: string) {
  const colon = model.indexOf(':');
  return colon === -1 ? '' : model.slice(0, colon).toLowerCase();
}

function hasKeyFor(model: string) {
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

function pickModel(requested: string) {
  if (requested && hasKeyFor(requested)) {
    return { model: requested, mode: requested.startsWith('mock:') ? 'demo' : 'live' };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      model: process.env.VISTA_AI_MODEL || 'openrouter:openai/gpt-4o-mini',
      mode: 'live' as const,
    };
  }
  if (process.env.GROQ_API_KEY) return { model: 'groq:llama-3.1-8b-instant', mode: 'live' as const };
  if (process.env.OPENAI_API_KEY) return { model: 'openai:gpt-4o-mini', mode: 'live' as const };
  if (process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY) {
    return { model: 'nvidia:meta/llama-3.1-8b-instruct', mode: 'live' as const };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { model: 'anthropic:claude-3-5-haiku-latest', mode: 'live' as const };
  }
  return { model: 'mock:echo', mode: 'demo' as const };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return Response.json({ error: 'prompt is required' }, { status: 400 });
  }

  const name = typeof body.name === 'string' && body.name ? body.name : 'support';
  const systemPrompt =
    typeof body.systemPrompt === 'string' && body.systemPrompt
      ? body.systemPrompt
      : 'You help ship Vista apps. Keep answers short and practical.';
  const requestedModel = typeof body.model === 'string' ? body.model : '';
  const { model, mode } = pickModel(requestedModel);

  const playgroundAgent = agent({
    name,
    model,
    systemPrompt,
    memory: false,
    maxSteps: 3,
  });

  const agentStream = playgroundAgent.stream({
    prompt,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
  });

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`meta: ${JSON.stringify({ mode, model, name })}\n`));
      try {
        for await (const chunk of agentStream) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(sse, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Vista-Playground-Mode': mode,
      'X-Vista-Playground-Model': model,
    },
  });
}
