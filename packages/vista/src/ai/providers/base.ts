import type { LanguageModel, ModelOptions } from '../types';
import { createOpenAIModel } from './openai';
import { createAnthropicModel } from './anthropic';
import { createGeminiModel } from './gemini';
import { createMockModel } from './mock';

export interface ParsedModel {
  provider: string;
  modelName: string;
}

export function parseModelIdentifier(model: string): ParsedModel {
  const trimmed = model.trim();
  const colonIndex = trimmed.indexOf(':');

  if (colonIndex !== -1) {
    const provider = trimmed.slice(0, colonIndex).toLowerCase();
    const modelName = trimmed.slice(colonIndex + 1);
    return { provider, modelName };
  }

  // Heuristic guessing if prefix omitted
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('gpt-') || lower.startsWith('o1-') || lower.startsWith('o3-')) {
    return { provider: 'openai', modelName: trimmed };
  }
  if (lower.startsWith('claude-')) {
    return { provider: 'anthropic', modelName: trimmed };
  }
  if (lower.startsWith('gemini-')) {
    return { provider: 'gemini', modelName: trimmed };
  }
  if (lower.startsWith('mock')) {
    return { provider: 'mock', modelName: trimmed };
  }

  if (lower.startsWith('llama-') || lower.startsWith('mixtral-') || lower.startsWith('gemma2-')) {
    return { provider: 'groq', modelName: trimmed };
  }

  // Default fallback
  return { provider: 'openai', modelName: trimmed };
}

export function resolveModel(
  model: string | LanguageModel,
  options: Partial<ModelOptions> = {}
): LanguageModel {
  if (typeof model === 'object' && model !== null && 'generateText' in model) {
    return model as LanguageModel;
  }

  if (typeof model !== 'string') {
    throw new Error('Model must be a model string or a LanguageModel implementation');
  }

  const { provider, modelName } = parseModelIdentifier(model);
  const modelOptions: ModelOptions = {
    model: modelName,
    ...options,
  };

  switch (provider) {
    case 'openai':
      return createOpenAIModel(modelOptions);

    case 'anthropic':
      return createAnthropicModel(modelOptions);

    case 'gemini':
      return createGeminiModel(modelOptions);

    case 'ollama':
      return createOpenAIModel({
        ...modelOptions,
        baseURL: options.baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
        apiKey: options.apiKey || 'ollama',
      });

    case 'nvidia':
    case 'nim':
      return createOpenAIModel({
        ...modelOptions,
        baseURL:
          options.baseURL ||
          process.env.NVIDIA_BASE_URL ||
          process.env.NIM_BASE_URL ||
          'https://integrate.api.nvidia.com/v1',
        apiKey: options.apiKey || process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || '',
      });

    case 'groq':
      return createOpenAIModel({
        ...modelOptions,
        baseURL: options.baseURL || process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
        apiKey: options.apiKey || process.env.GROQ_API_KEY || '',
      });

    case 'mock':
      return createMockModel({
        modelName,
      });

    default:
      throw new Error(
        `Unsupported model provider "${provider}". Supported providers: openai, anthropic, gemini, ollama, nvidia, groq, mock.`
      );
  }
}
