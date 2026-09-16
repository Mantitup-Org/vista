import type { GenerateOptions, GenerateResult, ModelProvider } from './types';
import { createReadableTextStream } from './stream';

export function resolveProvider(modelSpec: string | ModelProvider): ModelProvider {
  if (typeof modelSpec !== 'string') {
    return modelSpec;
  }

  const colonIdx = modelSpec.indexOf(':');
  const providerName = colonIdx !== -1 ? modelSpec.slice(0, colonIdx).toLowerCase() : 'mock';
  const modelName = colonIdx !== -1 ? modelSpec.slice(colonIdx + 1) : modelSpec;

  switch (providerName) {
    case 'openai':
      return createOpenAIProvider(modelName);
    case 'anthropic':
      return createAnthropicProvider(modelName);
    case 'gemini':
      return createGeminiProvider(modelName);
    case 'ollama':
    case 'local':
      return createOllamaProvider(modelName);
    default:
      return createMockProvider(modelName);
  }
}

/** Map internal message format to OpenAI chat message format. */
function toOpenAIMessages(messages: GenerateOptions['messages']): any[] {
  const result: any[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      // OpenAI expects tool results as role "tool" with tool_call_id
      result.push({
        role: 'tool',
        tool_call_id: m.toolCallId ?? '',
        content: m.content,
      });
    } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      // Preserve tool_calls on assistant messages for multi-turn tool use
      result.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls,
      });
    } else {
      result.push({
        role: m.role,
        content: m.content,
      });
    }
  }
  return result;
}

export function createOpenAIProvider(defaultModel = 'gpt-4o'): ModelProvider {
  return {
    name: 'openai',
    async generate(options: GenerateOptions): Promise<GenerateResult> {
      const apiKey = process.env.OPENAI_API_KEY;
      const model = options.model || defaultModel;

      if (!apiKey) {
        return createMockProvider(model).generate(options);
      }

      const body: any = {
        model,
        messages: toOpenAIMessages(options.messages),
        temperature: options.temperature ?? 0.7,
      };

      if (options.maxTokens) {
        body.max_tokens = options.maxTokens;
      }

      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        throw new Error(`OpenAI API error (${resp.status}): ${await resp.text()}`);
      }

      const data = (await resp.json()) as any;
      const choice = data.choices?.[0];
      const message = choice?.message;

      return {
        text: message?.content || '',
        toolCalls: message?.tool_calls,
        finishReason: choice?.finish_reason || 'stop',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    },

    async stream(options: GenerateOptions): Promise<ReadableStream<string>> {
      const apiKey = process.env.OPENAI_API_KEY;
      const model = options.model || defaultModel;

      if (!apiKey) {
        return createMockProvider(model).stream(options);
      }

      const body: any = {
        model,
        messages: toOpenAIMessages(options.messages),
        temperature: options.temperature ?? 0.7,
        stream: true,
      };

      if (options.maxTokens) {
        body.max_tokens = options.maxTokens;
      }

      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        throw new Error(`OpenAI stream error (${resp.status}): ${await resp.text()}`);
      }

      // Parse Server-Sent Events and emit text chunks as they arrive.
      const responseBody = resp.body;
      if (!responseBody) {
        throw new Error('OpenAI stream returned no body');
      }

      return new ReadableStream<string>({
        async start(controller) {
          const reader = responseBody.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;

                try {
                  const json = JSON.parse(trimmed.slice('data: '.length));
                  const delta = json.choices?.[0]?.delta;
                  if (delta?.content) {
                    controller.enqueue(delta.content);
                  }
                } catch {
                  // Ignore malformed SSE lines
                }
              }
            }
          } finally {
            reader.releaseLock();
            controller.close();
          }
        },
      });
    },
  };
}

export function createAnthropicProvider(defaultModel = 'claude-3-5-sonnet-20241022'): ModelProvider {
  return {
    name: 'anthropic',
    async generate(options: GenerateOptions): Promise<GenerateResult> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const model = options.model || defaultModel;

      if (!apiKey) {
        return createMockProvider(model).generate(options);
      }

      const systemMsg = options.messages.find((m) => m.role === 'system');
      const nonSystemMsgs = options.messages.filter((m) => m.role !== 'system');

      const body: any = {
        model,
        messages: nonSystemMsgs.map((m) => {
          if (m.role === 'tool') {
            return {
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: m.toolCallId ?? '', content: m.content }],
            };
          }
          if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
            // Anthropic expects tool_use blocks in the assistant turn, not just text
            const content: any[] = [];
            if (m.content) content.push({ type: 'text', text: m.content });
            for (const tc of m.toolCalls) {
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: typeof tc.function.arguments === 'string'
                  ? JSON.parse(tc.function.arguments)
                  : tc.function.arguments,
              });
            }
            return { role: 'assistant', content };
          }
          return { role: m.role, content: m.content };
        }),
        max_tokens: options.maxTokens ?? 1024,
      };

      if (systemMsg) {
        body.system = systemMsg.content;
      }

      // Include tools in Anthropic format
      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));
      }

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        throw new Error(`Anthropic API error (${resp.status}): ${await resp.text()}`);
      }

      const data = (await resp.json()) as any;
      const text = data.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('') || '';

      // Map Anthropic tool_use blocks to internal toolCalls format
      const toolUseBlocks = data.content?.filter((c: any) => c.type === 'tool_use') ?? [];
      const toolCalls =
        toolUseBlocks.length > 0
          ? toolUseBlocks.map((b: any) => ({
              id: b.id,
              type: 'function' as const,
              function: { name: b.name, arguments: b.input },
            }))
          : undefined;

      return {
        text,
        toolCalls,
        finishReason: data.stop_reason || 'end_turn',
        usage: {
          promptTokens: data.usage?.input_tokens || 0,
          completionTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
      };
    },

    async stream(options: GenerateOptions): Promise<ReadableStream<string>> {
      // TODO: Implement real Anthropic SSE streaming via /v1/messages with stream: true
      // For now, fall back to generate() then chunk — no first-byte latency benefit.
      const result = await this.generate(options);
      const text = result.text;
      const chunks = text.match(/.{1,16}/g) || [text];
      return createReadableTextStream(chunks);
    },
  };
}

export function createGeminiProvider(defaultModel = 'gemini-1.5-pro'): ModelProvider {
  return {
    name: 'gemini',
    async generate(options: GenerateOptions): Promise<GenerateResult> {
      const apiKey = process.env.GEMINI_API_KEY;
      const model = options.model || defaultModel;

      if (!apiKey) {
        return createMockProvider(model).generate(options);
      }

      const systemMsg2 = options.messages.find((m) => m.role === 'system');
      const nonSystemMsgs2 = options.messages.filter((m) => m.role !== 'system');

      // Map messages to Gemini 'contents' format, correctly handling tool turns.
      const contents = nonSystemMsgs2.map((m) => {
        // Tool result messages become user-role functionResponse parts
        if (m.role === 'tool') {
          let responseObj: any;
          try { responseObj = typeof m.content === 'string' ? JSON.parse(m.content) : m.content; }
          catch { responseObj = { result: m.content }; }
          return {
            role: 'user',
            parts: [{
              functionResponse: {
                name: (m as any).name ?? 'unknown',
                response: responseObj,
              },
            }],
          };
        }

        // Assistant messages with tool calls become model-role functionCall parts
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          const parts: any[] = [];
          if (m.content) parts.push({ text: m.content });
          for (const tc of m.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: typeof tc.function.arguments === 'string'
                  ? JSON.parse(tc.function.arguments)
                  : tc.function.arguments,
              },
            });
          }
          return { role: 'model', parts };
        }

        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        };
      });

      const body: any = { contents };

      // Pass system prompt via Gemini's systemInstruction field
      if (systemMsg2) {
        body.systemInstruction = { parts: [{ text: systemMsg2.content }] };
      }

      if (options.tools && options.tools.length > 0) {
        body.tools = [
          {
            function_declarations: options.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ];
      }

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!resp.ok) {
        throw new Error(`Gemini API error (${resp.status}): ${await resp.text()}`);
      }

      const data = (await resp.json()) as any;
      const candidate = data.candidates?.[0];
      const contentParts: any[] = candidate?.content?.parts ?? [];

      // Extract text parts
      const text = contentParts
        .filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('') || '';

      // Map Gemini functionCall parts to internal toolCalls format
      const functionCallParts = contentParts.filter((p: any) => p.functionCall);
      const toolCalls =
        functionCallParts.length > 0
          ? functionCallParts.map((p: any, idx: number) => ({
              id: `call_gemini_${idx}`,
              type: 'function' as const,
              function: {
                name: p.functionCall.name,
                arguments: p.functionCall.args ?? {},
              },
            }))
          : undefined;

      return {
        text,
        toolCalls,
        finishReason: candidate?.finishReason || 'STOP',
      };
    },

    async stream(options: GenerateOptions): Promise<ReadableStream<string>> {
      // TODO: Implement real Gemini SSE streaming via streamGenerateContent endpoint
      // For now, fall back to generate() then chunk — no first-byte latency benefit.
      const result = await this.generate(options);
      const text = result.text;
      const chunks = text.match(/.{1,16}/g) || [text];
      return createReadableTextStream(chunks);
    },
  };
}

export function createOllamaProvider(defaultModel = 'llama3'): ModelProvider {
  return {
    name: 'ollama',
    async generate(options: GenerateOptions): Promise<GenerateResult> {
      const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
      const model = options.model || defaultModel;

      try {
        const ollamaBody: any = {
          model,
          messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
          stream: false,
        };

        if (options.tools && options.tools.length > 0) {
          ollamaBody.tools = options.tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          }));
        }

        const resp = await fetch(`${host}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ollamaBody),
        });
        if (resp.ok) {
          const data = (await resp.json()) as any;
          const message = data.message ?? {};

          // Parse Ollama tool_calls if present
          const toolCalls =
            message.tool_calls && message.tool_calls.length > 0
              ? message.tool_calls.map((tc: any, idx: number) => ({
                  id: `call_ollama_${idx}`,
                  type: 'function' as const,
                  function: {
                    name: tc.function?.name ?? '',
                    arguments: tc.function?.arguments ?? {},
                  },
                }))
              : undefined;

          return {
            text: message.content || '',
            toolCalls,
            finishReason: 'stop',
          };
        }
      } catch {
        // fall back to mock
      }

      return createMockProvider(model).generate(options);
    },

    async stream(options: GenerateOptions): Promise<ReadableStream<string>> {
      const result = await this.generate(options);
      const chunks = result.text.match(/.{1,16}/g) || [result.text];
      return createReadableTextStream(chunks);
    },
  };
}

export function createMockProvider(model = 'mock-model'): ModelProvider {
  return {
    name: 'mock',
    async generate(options: GenerateOptions): Promise<GenerateResult> {
      const lastUserMsg = [...options.messages].reverse().find((m) => m.role === 'user');
      const prompt = lastUserMsg?.content || '';

      // Don't re-trigger tool calls for tool-result messages — only trigger on user prompts
      const hasToolResults = options.messages.some((m) => m.role === 'tool');

      // Check if user prompt matches any tool calling intent (only on fresh user messages)
      if (!hasToolResults && options.tools && options.tools.length > 0) {
        for (const tool of options.tools) {
          if (prompt.toLowerCase().includes(tool.name.toLowerCase()) || prompt.toLowerCase().includes('search')) {
            return {
              text: `Calling tool ${tool.name}...`,
              toolCalls: [
                {
                  id: `call_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: tool.name,
                    arguments: { query: prompt },
                  },
                },
              ],
              finishReason: 'tool_calls',
              usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
            };
          }
        }
      }

      const responseText = `[vista/ai (${model})] Response to: "${prompt}"`;
      return {
        text: responseText,
        finishReason: 'stop',
        usage: {
          promptTokens: prompt.length,
          completionTokens: responseText.length,
          totalTokens: prompt.length + responseText.length,
        },
      };
    },

    async stream(options: GenerateOptions): Promise<ReadableStream<string>> {
      const res = await this.generate(options);
      const text = res.text;
      const chunks = text.match(/.{1,12}/g) || [text];
      return createReadableTextStream(chunks);
    },
  };
}
