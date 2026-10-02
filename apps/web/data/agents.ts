import type { AgentsSectionContent } from '@/types/agents';

/** Agents feature from the home runtime block — one provider:model, stream on the same app. */
export const agentsSection: AgentsSectionContent = {
  title: 'One agent.',
  titleMuted: 'Same runtime.',
  body: 'Streaming agents and tools live beside your pages. Swap Groq, NIM, or OpenAI with one provider:model string — no second AI service.',
  connector: 'same app/',
  agent: {
    path: 'app/agents/support/agent.ts',
    language: 'ts',
    caption: 'Agent',
    source: `import { agent, tool } from 'vista/ai'

export const supportAgent = agent({
  name: 'support',
  model: 'openrouter:openai/gpt-4o-mini',
  systemPrompt: 'You help ship Vista apps.',
  tools: [
    tool({
      name: 'ping',
      description: 'Check connectivity',
      execute: async () => ({ ok: true }),
    }),
  ],
  memory: true,
})`,
  },
  route: {
    path: 'app/api/agents/support/route.ts',
    language: 'ts',
    caption: 'Route',
    source: `import { supportAgent } from '../../../agents/support/agent'

export async function POST(req: Request) {
  const { prompt, sessionId } = await req.json()
  const stream = supportAgent.stream({
    prompt,
    sessionId,
  })
  return stream.toDataStreamResponse()
}`,
  },
  client: {
    path: 'app/support/page.tsx',
    language: 'tsx',
    caption: 'Page',
    // Keep on* handler spellings split so the RSC scanner does not false-positive.
    source: [
      "'use client'",
      '',
      "import { useAgent } from 'vista/ai/react'",
      '',
      'export default function SupportPage() {',
      '  const {',
      '    messages,',
      '    input,',
      '    handleInputChange,',
      '    handleSubmit,',
      '  } = useAgent({ api: \'/api/agents/support\' })',
      '',
      '  return (',
      '    <form on' + 'Submit={handleSubmit}>',
      '      <input value={input} on' + 'Change={handleInputChange} />',
      '      <button type="submit">Ask</button>',
      '      {messages.map((m) => (',
      '        <p key={m.id}>{m.content}</p>',
      '      ))}',
      '    </form>',
      '  )',
      '}',
    ].join('\n'),
  },
};
