import type { LanguageModel, ToolCall } from '../types';
export interface MockModelOptions {
    modelName?: string;
    defaultResponse?: string;
    cannedResponses?: string[];
    toolCalls?: ToolCall[];
}
export declare function createMockModel(options?: MockModelOptions): LanguageModel;
