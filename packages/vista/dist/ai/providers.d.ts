import type { ModelProvider, ModelRequest, ModelResponse } from './types';
export interface OpenAICompatibleOptions {
    apiKey?: string;
    baseUrl?: string;
    headers?: Record<string, string>;
}
export declare function mockProvider(replies?: string[] | ((request: ModelRequest) => ModelResponse)): ModelProvider;
export declare function openaiCompatible(options?: OpenAICompatibleOptions & {
    id?: string;
}): ModelProvider;
export declare function openai(options?: OpenAICompatibleOptions): ModelProvider;
export declare function anthropic(options?: OpenAICompatibleOptions): ModelProvider;
export declare function google(options?: OpenAICompatibleOptions): ModelProvider;
export declare function qwen(options?: OpenAICompatibleOptions): ModelProvider;
export declare function localModel(options?: OpenAICompatibleOptions): ModelProvider;
export declare function resolveProvider(model: string | ModelProvider): {
    provider: ModelProvider;
    modelId: string;
};
