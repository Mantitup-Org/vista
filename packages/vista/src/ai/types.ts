export type AgentRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AgentMessage {
  role: AgentRole;
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  execute: (args: TArgs) => Promise<TResult> | TResult;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentObservation {
  agent: string;
  model: string;
  latencyMs: number;
  steps: number;
  toolCalls: Array<{ name: string; ms: number }>;
  usage: AgentUsage;
  costUsd?: number;
  error?: string;
}

export interface AgentGenerateResult {
  text: string;
  messages: AgentMessage[];
  toolCalls: ToolCall[];
  usage: AgentUsage;
  observation: AgentObservation;
}

export interface AgentStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'usage' | 'done' | 'error';
  text?: string;
  toolCall?: ToolCall;
  toolResult?: unknown;
  usage?: AgentUsage;
  error?: string;
}

export interface ModelRequest {
  model: string;
  messages: AgentMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  stream?: boolean;
}

export interface ModelResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: AgentUsage;
}

export interface ModelProvider {
  id: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export interface AgentMemory {
  get(sessionId: string): Promise<AgentMessage[]> | AgentMessage[];
  set(sessionId: string, messages: AgentMessage[]): Promise<void> | void;
  append?(sessionId: string, messages: AgentMessage[]): Promise<void> | void;
}

export interface AgentConfig {
  name: string;
  model: string | ModelProvider;
  instructions?: string;
  tools?: ToolDefinition[];
  memory?: boolean | AgentMemory;
  temperature?: number;
  maxSteps?: number;
  onObservation?: (observation: AgentObservation) => void;
}

export interface AgentGenerateOptions {
  input?: string;
  messages?: AgentMessage[];
  sessionId?: string;
  stream?: boolean;
}
