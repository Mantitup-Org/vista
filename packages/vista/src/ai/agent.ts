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

    const modelName = typeof model === 'string' ? model : provider.name;
    const result = await provider.generate({
      model: modelName,
      messages,
      tools,
      temperature: runOpts.temperature ?? config.temperature,
      maxTokens: runOpts.maxTokens ?? config.maxTokens,
    });

    if (result.toolCalls && result.toolCalls.length > 0) {
      const toolResults = await executeToolCalls(result.toolCalls);
      result.toolResults = toolResults;

      // Feed tool results back to memory if active
      if (memory) {
        await memory.addMessage(
          {
            role: 'assistant',
            content: result.text,
            toolCalls: result.toolCalls,
          },
          sessionId
        );

        for (const tr of toolResults) {
          await memory.addMessage(
            {
              role: 'tool',
              name: tr.toolName,
              toolCallId: tr.toolCallId,
              content: JSON.stringify(tr.result ?? { error: tr.error }),
            },
            sessionId
          );
        }
      }
    } else if (memory && result.text) {
      await memory.addMessage(
        {
          role: 'assistant',
          content: result.text,
        },
        sessionId
      );
    }

    return result;
  }

  async function stream(options: AgentRunOptions | string): Promise<AgentStreamResult> {
    const runOpts: AgentRunOptions = typeof options === 'string' ? { prompt: options } : options;
    const { messages } = await buildMessages(runOpts);

    const modelName = typeof model === 'string' ? model : provider.name;
    const textStream = await provider.stream({
      model: modelName,
      messages,
      tools,
      temperature: runOpts.temperature ?? config.temperature,
      maxTokens: runOpts.maxTokens ?? config.maxTokens,
    });

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
