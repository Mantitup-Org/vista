/**
 * Vista AI Core Types
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';
export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any> | string;
}
export interface ToolResult {
    toolCallId: string;
    name: string;
    result: any;
    isError?: boolean;
}
export interface Message {
    role: Role;
    content: string;
    name?: string;
    toolCallId?: string;
    toolCalls?: ToolCall[];
}
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
export interface ModelOptions {
    model: string;
    apiKey?: string;
    baseURL?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    headers?: Record<string, string>;
}
export interface GenerateTextOptions {
    messages: Message[];
    systemPrompt?: string;
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
}
export interface GenerateTextResult {
    text: string;
    toolCalls?: ToolCall[];
    usage?: TokenUsage;
    finishReason?: 'stop' | 'tool-calls' | 'length' | 'error' | string;
    raw?: any;
}
export type StreamChunkType = 'text-delta' | 'tool-call' | 'tool-result' | 'step-finish' | 'error' | 'done';
export interface StreamChunk {
    type: StreamChunkType;
    textDelta?: string;
    toolCall?: ToolCall;
    toolResult?: ToolResult;
    usage?: TokenUsage;
    error?: string;
}
export interface LanguageModel {
    provider: string;
    modelName: string;
    generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
    streamText(options: GenerateTextOptions): AsyncIterable<StreamChunk>;
}
export interface ToolContext {
    step: number;
    messages: Message[];
    agentName?: string;
    abortSignal?: AbortSignal;
}
export interface ToolDefinition<TParams = any, TResult = any> {
    name: string;
    description: string;
    parameters?: any;
    execute: (args: TParams, context?: ToolContext) => Promise<TResult> | TResult;
}
export interface AgentStep {
    stepNumber: number;
    prompt: Message[];
    text: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
    usage?: TokenUsage;
}
export interface AgentExecutionResult {
    text: string;
    messages: Message[];
    steps: AgentStep[];
    usage: TokenUsage;
    finishReason: string;
}
export interface ObservabilityHandler {
    onStepStart?: (stepNumber: number) => void;
    onStepFinish?: (step: AgentStep) => void;
    onToolCall?: (call: ToolCall) => void;
    onToolResult?: (result: ToolResult) => void;
    onError?: (error: Error) => void;
}
export interface AgentMemory {
    get(sessionId: string): Promise<Message[]> | Message[];
    save(sessionId: string, messages: Message[]): Promise<void> | void;
    clear(sessionId: string): Promise<void> | void;
}
export interface AgentConfig {
    name: string;
    model: string | LanguageModel;
    systemPrompt?: string | (() => string | Promise<string>);
    tools?: (ToolDefinition | any)[];
    memory?: boolean | AgentMemory;
    maxSteps?: number;
    temperature?: number;
    maxTokens?: number;
    observability?: boolean | ObservabilityHandler;
    onStepFinish?: (step: AgentStep) => void | Promise<void>;
}
