import { createMemory } from './memory';
import { emitAgentObservation, estimateCostUsd } from './observe';
import { resolveProvider } from './providers';
import type {
  AgentConfig,
  AgentGenerateOptions,
  AgentGenerateResult,
  AgentMessage,
  AgentObservation,
  AgentStreamEvent,
  AgentUsage,
  ModelProvider,
  ToolCall,
  ToolDefinition,
} from './types';

function emptyUsage(): AgentUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(left: AgentUsage, right: AgentUsage): AgentUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

async function runTool(tool: ToolDefinition, call: ToolCall): Promise<string> {
  const result = await tool.execute(call.arguments);
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

export class Agent {
  readonly name: string;
  readonly model: string | ModelProvider;
  readonly instructions?: string;
  readonly tools: ToolDefinition[];
  readonly temperature?: number;
  readonly maxSteps: number;
  private memoryEnabled: boolean;
  private memory;
  private onObservation?: AgentConfig['onObservation'];

  constructor(config: AgentConfig) {
    if (!config?.name) {
      throw new Error('vista/ai agent() requires a name.');
    }
    if (!config.model) {
      throw new Error(`vista/ai agent "${config.name}" requires a model.`);
    }

    this.name = config.name;
    this.model = config.model;
    this.instructions = config.instructions;
    this.tools = config.tools || [];
    this.temperature = config.temperature;
    this.maxSteps = config.maxSteps ?? 6;
    this.memoryEnabled = Boolean(config.memory);
    this.memory = typeof config.memory === 'object' ? createMemory(config.memory) : createMemory();
    this.onObservation = config.onObservation;
  }

  async generate(options: AgentGenerateOptions | string = {}): Promise<AgentGenerateResult> {
    const startedAt = Date.now();
    const resolved = typeof options === 'string' ? { input: options } : options;
    const { provider, modelId } = resolveProvider(this.model);
    const toolCalls: ToolCall[] = [];
    const toolTimings: Array<{ name: string; ms: number }> = [];
    let usage = emptyUsage();
    let error: string | undefined;

    const history = resolved.sessionId && this.memoryEnabled
      ? await this.memory.get(resolved.sessionId)
      : [];

    const messages: AgentMessage[] = [
      ...(this.instructions ? [{ role: 'system' as const, content: this.instructions }] : []),
      ...history,
      ...(resolved.messages || []),
      ...(resolved.input ? [{ role: 'user' as const, content: resolved.input }] : []),
    ];

    if (messages.filter((message) => message.role !== 'system').length === 0) {
      throw new Error(`Agent "${this.name}" requires input or messages.`);
    }

    try {
      for (let step = 0; step < this.maxSteps; step++) {
        const response = await provider.complete({
          model: modelId,
          messages,
          tools: this.tools,
          temperature: this.temperature,
        });
        usage = addUsage(usage, response.usage);

        if (response.toolCalls.length > 0) {
          for (const call of response.toolCalls) {
            toolCalls.push(call);
            const tool = this.tools.find((entry) => entry.name === call.name);
            const toolStarted = Date.now();
            const toolResult = tool
              ? await runTool(tool, call)
              : `Unknown tool: ${call.name}`;
            toolTimings.push({ name: call.name, ms: Date.now() - toolStarted });
            messages.push({
              role: 'assistant',
              content: response.text || '',
            });
            messages.push({
              role: 'tool',
              name: call.name,
              toolCallId: call.id,
              content: toolResult,
            });
          }
          continue;
        }

        messages.push({ role: 'assistant', content: response.text });
        const persistable = messages.filter((message) => message.role !== 'system');
        if (resolved.sessionId && this.memoryEnabled) {
          await this.memory.set(resolved.sessionId, persistable);
        }

        const observation = this.observe({
          modelId,
          startedAt,
          steps: step + 1,
          toolTimings,
          usage,
        });

        return {
          text: response.text,
          messages: persistable,
          toolCalls,
          usage,
          observation,
        };
      }

      error = `Agent "${this.name}" exceeded maxSteps (${this.maxSteps}).`;
      throw new Error(error);
    } catch (caught) {
      error = (caught as Error)?.message || String(caught);
      this.observe({
        modelId,
        startedAt,
        steps: toolCalls.length + 1,
        toolTimings,
        usage,
        error,
      });
      throw caught;
    }
  }

  async *stream(options: AgentGenerateOptions | string = {}): AsyncGenerator<AgentStreamEvent> {
    try {
      const result = await this.generate(options);
      if (result.text) {
        yield { type: 'text-delta', text: result.text };
      }
      for (const toolCall of result.toolCalls) {
        yield { type: 'tool-call', toolCall };
      }
      yield { type: 'usage', usage: result.usage };
      yield { type: 'done' };
    } catch (error) {
      yield { type: 'error', error: (error as Error)?.message || String(error) };
    }
  }

  private observe(input: {
    modelId: string;
    startedAt: number;
    steps: number;
    toolTimings: Array<{ name: string; ms: number }>;
    usage: AgentUsage;
    error?: string;
  }): AgentObservation {
    const observation: AgentObservation = {
      agent: this.name,
      model: input.modelId,
      latencyMs: Date.now() - input.startedAt,
      steps: input.steps,
      toolCalls: input.toolTimings,
      usage: input.usage,
      costUsd: estimateCostUsd(input.modelId, input.usage),
      error: input.error,
    };
    emitAgentObservation(observation);
    this.onObservation?.(observation);
    return observation;
  }
}

export function agent(config: AgentConfig): Agent {
  return new Agent(config);
}
