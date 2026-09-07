import { agent, tool } from 'vista/ai';

const searchDocs = tool({
  name: 'searchDocs',
  description: 'Search Vista docs for a topic',
  async execute({ query }: { query: string }) {
    return {
      query,
      hits: ['API routes live in app/api/**/route.ts', 'Agents live in app/agents/**/agent.ts'],
    };
  },
});

export const supportAgent = agent({
  name: 'support',
  model: process.env.OPENAI_API_KEY ? 'openai:gpt-4o-mini' : 'mock:support',
  instructions: 'Be brief. Prefer Vista-native APIs over extra backend frameworks.',
  tools: [searchDocs],
  memory: true,
});
