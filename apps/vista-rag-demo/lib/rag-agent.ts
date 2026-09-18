import {
  agent,
  InMemoryVectorStore,
  createRetrieverTool,
  type GenerateTextOptions,
  type GenerateTextResult,
  type LanguageModel,
  type StreamChunk,
} from 'vista/ai';
import { KNOWLEDGE_DOCS } from './rag-knowledge';

const store = new InMemoryVectorStore();
store.addDocuments([...KNOWLEDGE_DOCS]);

const retriever = createRetrieverTool({
  name: 'search_knowledge_base',
  description: 'Search the Vista knowledge base for docs, APIs, middleware, deploy, and AI/RAG facts.',
  store,
  topK: 3,
});

/**
 * Demo model: always retrieves via the KB tool on a user turn, then answers from tool results.
 * No API key required — shows the real agent + RAG tool loop end-to-end.
 */
function createRagDemoModel(): LanguageModel {
  return {
    provider: 'mock',
    modelName: 'rag-demo',

    async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
      const last = options.messages[options.messages.length - 1];

      if (last?.role === 'tool') {
        const toolMessages = [...options.messages].reverse().filter((m) => m.role === 'tool');
        const chunks: Array<{ id?: string; content?: string; score?: number }> = [];
        for (const msg of toolMessages) {
          try {
            const parsed = JSON.parse(msg.content);
            if (Array.isArray(parsed)) chunks.push(...parsed);
          } catch {
            // ignore
          }
        }

        const unique = chunks.filter(
          (c, i, arr) => c.content && arr.findIndex((x) => x.content === c.content) === i
        );

        let text: string;
        if (unique.length === 0) {
          text =
            'I searched the knowledge base but did not find a matching entry. Try asking about RSC, API routes, middleware, deploy, or RAG.';
        } else {
          const lines = unique.map(
            (c, i) => `${i + 1}. [${c.id ?? 'doc'} · score ${c.score ?? '?'}] ${c.content}`
          );
          text = `Based on the knowledge base:\n\n${lines.join('\n\n')}`;
        }

        return {
          text,
          usage: {
            promptTokens: 20,
            completionTokens: text.length / 4,
            totalTokens: 20 + text.length / 4,
          },
          finishReason: 'stop',
        };
      }

      const query =
        last?.role === 'user'
          ? last.content
          : options.messages.find((m) => m.role === 'user')?.content || '';

      return {
        text: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_knowledge_base',
            arguments: { query },
          },
        ],
        usage: { promptTokens: 15, completionTokens: 8, totalTokens: 23 },
        finishReason: 'tool-calls',
      };
    },

    async *streamText(options: GenerateTextOptions): AsyncIterable<StreamChunk> {
      const result = await this.generateText(options);

      if (result.toolCalls?.length) {
        for (const call of result.toolCalls) {
          yield { type: 'tool-call', toolCall: call };
        }
        return;
      }

      const words = result.text.split(/(\s+)/).filter(Boolean);
      for (const word of words) {
        yield { type: 'text-delta', textDelta: word };
      }
      yield { type: 'done', usage: result.usage };
    },
  };
}

export const ragAgent = agent({
  name: 'vista-rag-demo',
  model: createRagDemoModel(),
  systemPrompt:
    'You are a Vista docs assistant. Always search the knowledge base before answering. Only use retrieved facts.',
  tools: [retriever],
  maxSteps: 4,
});
