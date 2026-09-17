import { agent, tool } from 'vista/ai';

const searchDocsTool = tool({
  name: 'searchDocs',
  description: 'Search documentation for a keyword or query',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Documentation search terms' },
    },
    required: ['query'],
  },
  execute: async ({ query }: { query: string }) => {
    return {
      query,
      results: [
        { title: 'API Routes in Vista.js', url: '/docs/api-routes', snippet: 'Create route.ts files inside app/api' },
        { title: 'AI Framework in Vista.js', url: '/docs/ai', snippet: 'Native agent(), tool(), and streaming' },
      ],
    };
  },
});

export const supportAgent = agent({
  name: 'support-agent',
  model: 'openai:gpt-4o',
  system: 'You are the official Vista.js support agent. Help developers build fast, AI-native full-stack applications.',
  tools: [searchDocsTool],
});
