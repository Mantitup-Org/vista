import { parseModelIdentifier } from './providers/base';

export interface EmbedOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
}

interface ResolvedEmbedTarget {
  modelName: string;
  baseURL: string;
  apiKey: string;
}

function resolveEmbedTarget(options: EmbedOptions = {}): ResolvedEmbedTarget {
  const identifier = parseModelIdentifier(options.model || 'openai:text-embedding-3-small');
  const provider = identifier.provider;
  const modelName = identifier.modelName || 'text-embedding-3-small';

  if (provider === 'nvidia' || provider === 'nim') {
    return {
      modelName,
      baseURL: (
        options.baseURL ||
        process.env.NVIDIA_BASE_URL ||
        process.env.NIM_BASE_URL ||
        'https://integrate.api.nvidia.com/v1'
      ).replace(/\/+$/, ''),
      apiKey: options.apiKey || process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || '',
    };
  }

  if (provider === 'groq') {
    return {
      modelName,
      baseURL: (options.baseURL || process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(
        /\/+$/,
        ''
      ),
      apiKey: options.apiKey || process.env.GROQ_API_KEY || '',
    };
  }

  if (provider === 'ollama') {
    return {
      modelName,
      baseURL: (options.baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1').replace(
        /\/+$/,
        ''
      ),
      apiKey: options.apiKey || 'ollama',
    };
  }

  return {
    modelName,
    baseURL: (options.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
      /\/+$/,
      ''
    ),
    apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
  };
}

export async function embedTexts(texts: string[], options: EmbedOptions = {}): Promise<number[][]> {
  const target = resolveEmbedTarget(options);
  const response = await fetch(`${target.baseURL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: target.modelName,
      input: texts,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Embedding request failed (${response.status}): ${detail || response.statusText}`);
  }

  const json = (await response.json()) as { data?: Array<{ embedding?: number[]; index?: number }> };
  const rows = [...(json.data || [])].sort((left, right) => (left.index || 0) - (right.index || 0));
  return rows.map((row) => row.embedding || []);
}

export async function embedText(text: string, options: EmbedOptions = {}): Promise<number[]> {
  const [vector] = await embedTexts([text], options);
  return vector || [];
}

export function createEmbeddings(options: EmbedOptions = {}) {
  return {
    embedText: (text: string) => embedText(text, options),
    embedTexts: (texts: string[]) => embedTexts(texts, options),
  };
}
