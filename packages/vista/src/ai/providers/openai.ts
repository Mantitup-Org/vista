import type {
  GenerateTextOptions,
  GenerateTextResult,
  LanguageModel,
  Message,
  ModelOptions,
  StreamChunk,
  ToolCall,
} from '../types';
import { formatToolForOpenAI } from '../tool';

function formatMessagesForOpenAI(messages: Message[], systemPrompt?: string): any[] {
  const result: any[] = [];
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      result.push({
        role: 'tool',
        tool_call_id: msg.toolCallId || 'call_default',
        content: msg.content,
      });
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      result.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments:
              typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
          },
        })),
      });
    } else {
      result.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  return result;
}

export function createOpenAIModel(options: ModelOptions): LanguageModel {
  const baseURL = (
    options.baseURL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '');

  const apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
  const modelName = options.model || 'gpt-4o';

  return {
    provider: 'openai',
    modelName,

    async generateText(genOptions: GenerateTextOptions): Promise<GenerateTextResult> {
      const url = `${baseURL}/chat/completions`;
      const messages = formatMessagesForOpenAI(genOptions.messages, genOptions.systemPrompt);

      const body: any = {
        model: modelName,
        messages,
        temperature: genOptions.temperature ?? options.temperature ?? 0.7,
      };

      if (genOptions.maxTokens || options.maxTokens) {
        body.max_tokens = genOptions.maxTokens || options.maxTokens;
      }

      if (genOptions.tools && genOptions.tools.length > 0) {
        body.tools = genOptions.tools.map(formatToolForOpenAI);
        body.tool_choice = 'auto';
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: genOptions.abortSignal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`OpenAI API request failed [${res.status}]: ${errText}`);
      }

      const data: any = await res.json();
      const choice = data.choices?.[0];
      const message = choice?.message;

      let toolCalls: ToolCall[] | undefined;
      if (message?.tool_calls && message.tool_calls.length > 0) {
        toolCalls = message.tool_calls.map((tc: any) => {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(tc.function?.arguments || '{}');
          } catch {
            parsedArgs = { raw: tc.function?.arguments };
          }
          return {
            id: tc.id,
            name: tc.function?.name,
            arguments: parsedArgs,
          };
        });
      }

      return {
        text: message?.content || '',
        toolCalls,
        finishReason: choice?.finish_reason || 'stop',
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            }
          : undefined,
        raw: data,
      };
    },

    async *streamText(genOptions: GenerateTextOptions): AsyncIterable<StreamChunk> {
      const url = `${baseURL}/chat/completions`;
      const messages = formatMessagesForOpenAI(genOptions.messages, genOptions.systemPrompt);

      const body: any = {
        model: modelName,
        messages,
        temperature: genOptions.temperature ?? options.temperature ?? 0.7,
        stream: true,
      };

      if (genOptions.maxTokens || options.maxTokens) {
        body.max_tokens = genOptions.maxTokens || options.maxTokens;
      }

      if (genOptions.tools && genOptions.tools.length > 0) {
        body.tools = genOptions.tools.map(formatToolForOpenAI);
        body.tool_choice = 'auto';
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: genOptions.abortSignal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`OpenAI API stream request failed [${res.status}]: ${errText}`);
      }

      if (!res.body) {
        throw new Error('ReadableStream not supported on fetch response');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') {
              yield { type: 'done' };
              return;
            }
            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  yield { type: 'text-delta', textDelta: delta.content };
                }
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    let parsedArgs = {};
                    try {
                      parsedArgs = JSON.parse(tc.function?.arguments || '{}');
                    } catch {
                      parsedArgs = { raw: tc.function?.arguments };
                    }
                    yield {
                      type: 'tool-call',
                      toolCall: {
                        id: tc.id || `call_${Date.now()}`,
                        name: tc.function?.name || '',
                        arguments: parsedArgs,
                      },
                    };
                  }
                }
              } catch {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      yield { type: 'done' };
    },
  };
}
