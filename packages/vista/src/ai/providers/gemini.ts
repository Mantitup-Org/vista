import type {
  GenerateTextOptions,
  GenerateTextResult,
  LanguageModel,
  Message,
  ModelOptions,
  StreamChunk,
  ToolCall,
} from '../types';
import { formatToolForGemini } from '../tool';

function formatMessagesForGemini(messages: Message[]): any[] {
  const contents: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.name || 'tool_response',
              response: { content: msg.content },
            },
          },
        ],
      });
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const parts: any[] = [];
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      for (const tc of msg.toolCalls) {
        parts.push({
          functionCall: {
            name: tc.name,
            args:
              typeof tc.arguments === 'object' ? tc.arguments : JSON.parse(tc.arguments || '{}'),
          },
        });
      }
      contents.push({ role: 'model', parts });
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  return contents;
}

export function createGeminiModel(options: ModelOptions): LanguageModel {
  const baseURL = (
    options.baseURL ||
    process.env.GEMINI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta'
  ).replace(/\/+$/, '');

  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const modelName = options.model || 'gemini-1.5-flash';

  return {
    provider: 'gemini',
    modelName,

    async generateText(genOptions: GenerateTextOptions): Promise<GenerateTextResult> {
      const url = `${baseURL}/models/${modelName}:generateContent?key=${apiKey}`;
      const contents = formatMessagesForGemini(genOptions.messages);

      const body: any = {
        contents,
        generationConfig: {
          temperature: genOptions.temperature ?? options.temperature ?? 0.7,
        },
      };

      if (genOptions.systemPrompt) {
        body.systemInstruction = {
          parts: [{ text: genOptions.systemPrompt }],
        };
      }

      if (genOptions.maxTokens || options.maxTokens) {
        body.generationConfig.maxOutputTokens = genOptions.maxTokens || options.maxTokens;
      }

      if (genOptions.tools && genOptions.tools.length > 0) {
        body.tools = [
          {
            functionDeclarations: genOptions.tools.map(formatToolForGemini),
          },
        ];
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: genOptions.abortSignal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini API request failed [${res.status}]: ${errText}`);
      }

      const data: any = await res.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      let text = '';
      const toolCalls: ToolCall[] = [];

      for (const part of parts) {
        if (part.text) {
          text += part.text;
        } else if (part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${toolCalls.length}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {},
          });
        }
      }

      const usageMetadata = data.usageMetadata;

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: candidate?.finishReason || 'stop',
        usage: usageMetadata
          ? {
              promptTokens: usageMetadata.promptTokenCount || 0,
              completionTokens: usageMetadata.candidatesTokenCount || 0,
              totalTokens: usageMetadata.totalTokenCount || 0,
            }
          : undefined,
        raw: data,
      };
    },

    async *streamText(genOptions: GenerateTextOptions): AsyncIterable<StreamChunk> {
      const url = `${baseURL}/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const contents = formatMessagesForGemini(genOptions.messages);

      const body: any = {
        contents,
        generationConfig: {
          temperature: genOptions.temperature ?? options.temperature ?? 0.7,
        },
      };

      if (genOptions.systemPrompt) {
        body.systemInstruction = {
          parts: [{ text: genOptions.systemPrompt }],
        };
      }

      if (genOptions.tools && genOptions.tools.length > 0) {
        body.tools = [
          {
            functionDeclarations: genOptions.tools.map(formatToolForGemini),
          },
        ];
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: genOptions.abortSignal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini stream request failed [${res.status}]: ${errText}`);
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
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);

            try {
              const data = JSON.parse(payload);
              const candidate = data.candidates?.[0];
              const parts = candidate?.content?.parts || [];
              for (const part of parts) {
                if (part.text) {
                  yield { type: 'text-delta', textDelta: part.text };
                }
              }
            } catch {
              // Ignore partial JSON parse errors
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
