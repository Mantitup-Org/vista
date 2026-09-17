import type { ModelProvider } from './types';
export declare function resolveProvider(modelSpec: string | ModelProvider): ModelProvider;
export declare function createOpenAIProvider(defaultModel?: string): ModelProvider;
export declare function createAnthropicProvider(defaultModel?: string): ModelProvider;
export declare function createGeminiProvider(defaultModel?: string): ModelProvider;
export declare function createOllamaProvider(defaultModel?: string): ModelProvider;
export declare function createMockProvider(model?: string): ModelProvider;
