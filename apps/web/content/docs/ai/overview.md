---
category: 'ai'
slug: 'overview'
title: 'AI Framework Overview'
summary: 'Build native AI applications, agents, tools, and streaming workflows directly in Vista.js.'
order: 1
updatedAt: '2026-03-20'
---

Vista.js is designed as an **AI-native full-stack framework**. Rather than forcing developers to integrate disparate external libraries, Vista provides first-class primitives for building AI agents, multi-agent workflows, native tools, conversation memory, RAG, and real-time streaming interfaces.

## Why Native AI?

In traditional stacks, combining models, tool execution loops, memory persistence, streaming responses, and React UI components requires stitching together multiple third-party libraries that add significant bundle size and latency.

Vista AI provides:

- **Zero External Heavyweight Dependencies**: Implemented natively on top of Web `fetch`, Web Streams `ReadableStream`, and standard SSE protocols.
- **Unified Full-Stack Architecture**: Agents live directly in your project alongside UI and backend APIs (`app/agents/`, `app/api/`).
- **Multi-Provider Support**: Seamlessly switch between OpenAI, Anthropic Claude, Google Gemini, Ollama, and local models with a single unified API.
- **First-Class React Integration**: Stream agent responses into client components using the native `useAgent` hook.

## Quick Example

### 1. Define an Agent

```typescript title="app/agents/support/agent.ts"
import { agent, tool } from '@vistagenic/vista/ai';

export const supportAgent = agent({
  name: 'support',
  model: 'openai:gpt-4o',
  systemPrompt: 'You are a helpful customer support agent for our store.',
  tools: [
    tool({
      name: 'check_order_status',
      description: 'Check status for an order ID',
      parameters: {
        type: 'object',
        properties: { orderId: { type: 'string' } },
        required: ['orderId'],
      },
      execute: async ({ orderId }) => ({
        orderId,
        status: 'shipped',
        estimatedDelivery: '2 days',
      }),
    }),
  ],
  memory: true,
});
```

### 2. Expose via Route Handler

```typescript title="app/api/chat/route.ts"
import { supportAgent } from '@/app/agents/support/agent';

export async function POST(req: Request) {
  const { prompt, messages, sessionId } = await req.json();
  const stream = supportAgent.stream({ prompt, messages, sessionId });
  return stream.toDataStreamResponse();
}
```

### 3. Consume in React UI

```tsx title="app/chat/page.tsx"
'use client';

import { useAgent } from '@vistagenic/vista/ai/react';

export default function ChatPage() {
  const { messages, input, setInput, handleSubmit, isLoading } = useAgent({
    api: '/api/chat',
  });

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            {m.content}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

## CLI Scaffolding

Generate typed agents and companion streaming route handlers with one command:

```bash
vista g agent support
```

This generates:

- `app/agents/support/agent.ts`
- `app/api/agents/support/route.ts`

## Next Steps

- [Defining Agents & Tools](/docs/ai/agents)
- [Streaming & UI Hooks](/docs/ai/streaming)
- [Model Providers Configuration](/docs/ai/providers)
