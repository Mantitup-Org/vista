import type {
  Agent,
  AgentConfig,
  AgentRunOptions,
  AgentStreamResult,
  GenerateResult,
  MemoryStore,
  Message,
  ToolResult,
} from './types';
import { resolveProvider } from './providers';
import { InMemoryHistory } from './memory';
import { toDataStreamResponse, toTextStreamResponse } from './stream';

/** Strip provider prefix from model spec (e.g. "openai:gpt-4o" -> "gpt-4o") */
function stripProviderPrefix(model: string): string {
  const idx = model.indexOf(':');
  if (idx === -1) return model;
  return model.slice(idx + 1) || model;
}

/** Validate tool arguments against a JSON Schema (required fields + basic types). */
function validateToolArgs(args: Record<string, unknown>, schema: any, toolName: string): string | null {
  if (!schema || typeof schema !== 'object') return null;

  const required: string[] = schema.required ?? [];
  for (const field of required) {
    if (!(field in args)) {
      return `Tool "${toolName}" missing required parameter: "${field}"`;
    }
  }

  const props: Record<string, { type?: string }> = schema.properties ?? {};
  for (const [key, def] of Object.entries(props)) {
    if (key in args && def.type) {
      const actualType = Array.isArray(args[key]) ? 'array' : typeof args[key];
      if (actualType !== def.type) {
        return `Tool "${toolName}" parameter "${key}" expected type "${def.type}" but got "${actualType}"`;
      }
    }
  }

  return null;
}

const MAX_TOOL_ITERATIONS = 5;

export function agent(config: AgentConfig): Agent {
  if (!config.model) {
    throw new Error('[vista/ai] Agent must specify a "model"');
  }

  const name = config.name || 'agent';
  const model = config.model;
  const systemPrompt = config.systemPrompt || config.system;
  const tools = config.tools || [];
  const memory: MemoryStore | undefined =
    config.memory === true
      ? new InMemoryHistory()
      : config.memory && typeof config.memory === 'object'
        ? config.memory
        : undefined;

  const provider = resolveProvider(model);
  // The model name passed to the provider must not include the provider prefix.
  const resolvedModelName =
    typeof model === 'string' ? stripProviderPrefix(model) : provider.name;

  async function buildMessages(runOpts: AgentRunOptions): Promise<{
    messages: Message[];
    sessionId: string;
  }> {
    const sessionId = runOpts.sessionId || 'default';
    const messages: Message[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (memory) {
      const history = await memory.getMessages(sessionId);
      messages.push(...history);
    }

    if (runOpts.messages && runOpts.messages.length > 0) {
      messages.push(...runOpts.messages);
    }

    if (runOpts.prompt) {
      const userMessage: Message = { role: 'user', content: runOpts.prompt };
      messages.push(userMessage);
      if (memory) {
        await memory.addMessage(userMessage, sessionId);
      }
    }

    return { messages, sessionId };
  }

  async function executeToolCalls(
    toolCalls: NonNullable<GenerateResult['toolCalls']>
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of toolCalls) {
      const toolDef = tools.find((t) => t.name === call.function.name);
      if (!toolDef) {
        results.push({
          toolCallId: call.id,
          toolName: call.function.name,
          result: null,
          error: `Tool "${call.function.name}" not found on agent "${name}"`,
        });
        continue;
      }

      try {
        const rawArgs = call.function.arguments;
        const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

        // Validate args against the tool's JSON Schema before execution
        const validationError = validateToolArgs(args, toolDef.parameters, toolDef.name);
        if (validationError) {
          results.push({
            toolCallId: call.id,
            toolName: toolDef.name,
            result: null,
            error: validationError,
          });
          continue;
        }

        const result = await toolDef.execute(args);
        results.push({
          toolCallId: call.id,
          toolName: toolDef.name,
          result,
        });
      } catch (err) {
        results.push({
          toolCallId: call.id,
          toolName: toolDef.name,
          result: null,
          error: (err as Error)?.message ?? String(err),
        });
      }
    }
    return results;
  }

  async function generate(options: AgentRunOptions | string): Promise<GenerateResult> {
    const runOpts: AgentRunOptions = typeof options === 'string' ? { prompt: options } : options;
    const { messages, sessionId } = await buildMessages(runOpts);

    // Conversation loop: keep running until the model stops requesting tools.
    const conversationMessages = [...messages];
    // Accumulate all tool calls and results across iterations so callers can inspect them.
    const allToolCalls: NonNullable<GenerateResult['toolCalls']> = [];
    const allToolResults: ToolResult[] = [];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const result = await provider.generate({
        model: resolvedModelName,
        messages: conversationMessages,
        tools,
        temperature: runOpts.temperature ?? config.temperature,
        maxTokens: runOpts.maxTokens ?? config.maxTokens,
      });

      if (result.toolCalls && result.toolCalls.length > 0) {
        const toolResults = await executeToolCalls(result.toolCalls);
        result.toolResults = toolResults;

        // Accumulate across iterations
        allToolCalls.push(...result.toolCalls);
        allToolResults.push(...toolResults);

        // Record assistant turn with tool calls
        const assistantMessage: Message = {
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls,
        };
        conversationMessages.push(assistantMessage);
        if (memory) {
          await memory.addMessage(assistantMessage, sessionId);
        }

        // Record tool result messages and add to conversation
        for (const tr of toolResults) {
          const toolMessage: Message = {
            role: 'tool',
            name: tr.toolName,
            toolCallId: tr.toolCallId,
            content: JSON.stringify(tr.result ?? { error: tr.error }),
          };
          conversationMessages.push(toolMessage);
          if (memory) {
            await memory.addMessage(toolMessage, sessionId);
          }
        }

        // Loop back to let the model produce its final answer
        continue;
      }

      // No more tool calls — record assistant response and return
      if (memory && result.text) {
        await memory.addMessage(
          {
            role: 'assistant',
            content: result.text,
          },
          sessionId
        );
      }

      // Merge accumulated tool call info into the final result
      if (allToolCalls.length > 0) {
        result.toolCalls = allToolCalls;
        result.toolResults = allToolResults;
      }

      return result;
    }

    // Exceeded max iterations — build merged final result
    const lastResult: GenerateResult = {
      text: allToolResults.length > 0
        ? JSON.stringify(allToolResults[allToolResults.length - 1].result ?? '')
        : '',
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      toolResults: allToolResults.length > 0 ? allToolResults : undefined,
      finishReason: 'length',
    };
    return lastResult;
  }

  async function stream(options: AgentRunOptions | string): Promise<AgentStreamResult> {
    const runOpts: AgentRunOptions = typeof options === 'string' ? { prompt: options } : options;
    const { messages, sessionId } = await buildMessages(runOpts);

    const rawStream = await provider.stream({
      model: resolvedModelName,
      messages,
      tools,
      temperature: runOpts.temperature ?? config.temperature,
      maxTokens: runOpts.maxTokens ?? config.maxTokens,
    });

    // Wrap the stream in a passthrough that collects text for memory recording.
    // This avoids tee() race conditions where fire-and-forget memory writes
    // happen after clearMemory() is called by the consumer.
    let collectedText = '';
    const memoryCapturingStream = new TransformStream<string, string>({
      transform(chunk, controller) {
        collectedText += chunk;
        controller.enqueue(chunk);
      },
      async flush(_controller) {
        if (memory && collectedText) {
          try {
            await memory.addMessage(
              { role: 'assistant', content: collectedText },
              sessionId
            );
          } catch {
            // Memory recording is best-effort
          }
        }
      },
    });

    const textStream = rawStream.pipeThrough(memoryCapturingStream);

    // Tee into two independent branches:
    //   stream1 — returned as textStream for direct consumer reading
    //   stream2 — used by toTextStreamResponse / toDataStreamResponse helpers
    const [stream1, stream2] = textStream.tee();

    return {
      textStream: stream1,
      toTextStreamResponse(init?: ResponseInit) {
        return toTextStreamResponse(stream2, init);
      },
      toDataStreamResponse(init?: ResponseInit) {
        return toDataStreamResponse(stream2, init);
      },
    };
  }


  return {
    name,
    model,
    systemPrompt,
    tools,
    memory,
    run: generate,
    generate,
    stream,
    async getHistory(sessionId = 'default'): Promise<Message[]> {
      if (!memory) return [];
      return await memory.getMessages(sessionId);
    },
    async clearMemory(sessionId = 'default'): Promise<void> {
      if (!memory) return;
      await memory.clear(sessionId);
    },
    async addMessage(message: Message, sessionId = 'default'): Promise<void> {
      if (!memory) return;
      await memory.addMessage(message, sessionId);
    },
  };
}

export const createAgent = agent;
