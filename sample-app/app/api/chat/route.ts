import { agent, tool } from 'vista/ai';

const calculatorTool = tool({
  name: 'calculate',
  description: 'Evaluate a mathematical expression',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'The math expression to evaluate' },
    },
    required: ['expression'],
  },
  execute: async ({ expression }: { expression: string }) => {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().]/g, '');
      const result = Function(`'use strict'; return (${sanitized})`)();
      return { expression, result };
    } catch {
      return { error: 'Invalid expression' };
    }
  },
});

const assistant = agent({
  name: 'vista-assistant',
  model: 'openai:gpt-4o',
  system: 'You are a helpful AI assistant built directly into Vista.js full-stack framework.',
  tools: [calculatorTool],
});

export async function POST(request: Request) {
  const { prompt } = await request.json();
  const streamResult = await assistant.stream(prompt || 'Hello Vista!');
  return streamResult.toTextStreamResponse();
}
