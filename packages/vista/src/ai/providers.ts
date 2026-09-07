import type { AgentMessage, ModelProvider, ModelRequest, ModelResponse, ToolCall } from './types';

export interface OpenAICompatibleOptions {
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

function env(name: string): string | undefined {
  return process.env[name];
}

function parseModelRef(value: string): { provider: string; model: string } {
  const trimmed = String(value || '').trim();
  const idx = trimmed.indexOf(':');
  if (idx === -1) {
    return { provider: 'openai', model: trimmed };
  }
  return {
    provider: trimmed.slice(0, idx).toLowerCase(),
    model: trimmed.slice(idx + 1),
  };
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function mockProvider(replies?: string[] | ((request: ModelRequest) => ModelResponse)): ModelProvider {
  let turn = 0;
  return {
    id: 'mock',
    async complete(request) {
      if (typeof replies === 'function') {
        return replies(request);
      }
      const text = replies?.[turn] ?? `mock:${request.messages.at(-1)?.content ?? ''}`;
      turn += 1;
      return {
        text,
        toolCalls: [],
        usage: {
          inputTokens: JSON.stringify(request.messages).length,
          outputTokens: text.length,
          totalTokens: JSON.stringify(request.messages).length + text.length,
        },
      };
    },
  };
}

function toOpenAIMessages(messages: AgentMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    name: message.name,
    tool_call_id: message.toolCallId,
  }));
}

function toOpenAITools(request: ModelRequest) {
  if (!request.tools || request.tools.length === 0) return undefined;
  return request.tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: 'object', properties: {} },
    },
  }));
}

async function completeOpenAICompatible(
  options: Required<Pick<OpenAICompatibleOptions, 'baseUrl'>> & OpenAICompatibleOptions,
  request: ModelRequest
): Promise<ModelResponse> {
  const apiKey = options.apiKey;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: request.model,
      messages: toOpenAIMessages(request.messages),
      tools: toOpenAITools(request),
      temperature: request.temperature ?? 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AI provider request failed (${response.status}): ${body || response.statusText}`);
  }

  const payload = (await response.json()) as any;
  const choice = payload.choices?.[0]?.message || {};
  const toolCalls: ToolCall[] = Array.isArray(choice.tool_calls)
    ? choice.tool_calls.map((call: any) => ({
        id: call.id || randomId('tool'),
        name: call.function?.name || 'unknown',
        arguments: safeParseArgs(call.function?.arguments),
      }))
    : [];

  const usage = payload.usage || {};
  return {
    text: String(choice.content || ''),
    toolCalls,
    usage: {
      inputTokens: Number(usage.prompt_tokens || 0),
      outputTokens: Number(usage.completion_tokens || 0),
      totalTokens: Number(usage.total_tokens || 0),
    },
  };
}

function safeParseArgs(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value));
  } catch {
    return { raw: String(value) };
  }
}

export function openaiCompatible(options: OpenAICompatibleOptions & { id?: string } = {}): ModelProvider {
  return {
    id: options.id || 'openai-compatible',
    complete(request) {
      return completeOpenAICompatible(
        {
          apiKey: options.apiKey,
          baseUrl: options.baseUrl || 'https://api.openai.com/v1',
          headers: options.headers,
        },
        request
      );
    },
  };
}

export function openai(options: OpenAICompatibleOptions = {}): ModelProvider {
  return openaiCompatible({
    ...options,
    id: 'openai',
    apiKey: options.apiKey || env('OPENAI_API_KEY'),
    baseUrl: options.baseUrl || env('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
  });
}

export function anthropic(options: OpenAICompatibleOptions = {}): ModelProvider {
  return openaiCompatible({
    ...options,
    id: 'anthropic',
    apiKey: options.apiKey || env('ANTHROPIC_API_KEY'),
    baseUrl: options.baseUrl || env('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com/v1',
    headers: {
      'anthropic-version': '2023-06-01',
      ...(options.headers || {}),
    },
  });
}

export function google(options: OpenAICompatibleOptions = {}): ModelProvider {
  return openaiCompatible({
    ...options,
    id: 'google',
    apiKey: options.apiKey || env('GOOGLE_API_KEY') || env('GEMINI_API_KEY'),
    baseUrl: options.baseUrl || env('GOOGLE_BASE_URL') || 'https://generativelanguage.googleapis.com/v1beta/openai',
  });
}

export function qwen(options: OpenAICompatibleOptions = {}): ModelProvider {
  return openaiCompatible({
    ...options,
    id: 'qwen',
    apiKey: options.apiKey || env('DASHSCOPE_API_KEY') || env('QWEN_API_KEY'),
    baseUrl: options.baseUrl || env('QWEN_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  });
}

export function localModel(options: OpenAICompatibleOptions = {}): ModelProvider {
  return openaiCompatible({
    ...options,
    id: 'local',
    apiKey: options.apiKey || env('LOCAL_LLM_API_KEY') || 'local',
    baseUrl: options.baseUrl || env('LOCAL_LLM_BASE_URL') || 'http://127.0.0.1:11434/v1',
  });
}

const builtinProviders: Record<string, () => ModelProvider> = {
  openai: () => openai(),
  anthropic: () => anthropic(),
  google: () => google(),
  gemini: () => google(),
  qwen: () => qwen(),
  local: () => localModel(),
  ollama: () => localModel(),
  mock: () => mockProvider(),
};

export function resolveProvider(model: string | ModelProvider): { provider: ModelProvider; modelId: string } {
  if (typeof model !== 'string') {
    return { provider: model, modelId: model.id };
  }

  const parsed = parseModelRef(model);
  const factory = builtinProviders[parsed.provider];
  if (!factory) {
    throw new Error(
      `Unknown AI provider "${parsed.provider}". Use openai, anthropic, google, qwen, local, or a custom ModelProvider.`
    );
  }
  return { provider: factory(), modelId: parsed.model };
}
