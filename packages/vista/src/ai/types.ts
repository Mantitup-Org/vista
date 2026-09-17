/**
 * Vista.js AI Application Framework Types
 */

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string | Record<string, any>;
  };
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: any;
  error?: string;
}

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  execute: (params: TParams) => Promise<TResult> | TResult;
}

export interface MemoryStore {
  getMessages(sessionId?: string): Promise<Message[]> | Message[];
  addMessage(message: Message, sessionId?: string): Promise<void> | void;
  clear(sessionId?: string): Promise<void> | void;
}

export interface ModelProvider {
  name: string;
  generate(options: GenerateOptions): Promise<GenerateResult>;
  stream(options: GenerateOptions): Promise<ReadableStream<string>>;
}

export interface GenerateOptions {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AgentConfig {
  name?: string;
  model: string | ModelProvider;
  system?: string;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  memory?: boolean | MemoryStore;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentRunOptions {
  prompt?: string;
  messages?: Message[];
  sessionId?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentStreamResult {
  textStream: ReadableStream<string>;
  toTextStreamResponse(init?: ResponseInit): Response;
  toDataStreamResponse(init?: ResponseInit): Response;
}

export interface Agent {
  name: string;
  model: string | ModelProvider;
  systemPrompt?: string;
  tools: ToolDefinition[];
  memory?: MemoryStore;
  run(options: AgentRunOptions | string): Promise<GenerateResult>;
  generate(options: AgentRunOptions | string): Promise<GenerateResult>;
  stream(options: AgentRunOptions | string): Promise<AgentStreamResult>;
  getHistory(sessionId?: string): Promise<Message[]>;
  clearMemory(sessionId?: string): Promise<void>;
  addMessage(message: Message, sessionId?: string): Promise<void>;
}
