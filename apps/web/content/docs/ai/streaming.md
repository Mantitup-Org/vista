---
category: 'ai'
slug: 'streaming'
title: 'Streaming & UI Hooks'
summary: 'Stream agent responses in real time using Server-Sent Events (SSE) and the useAgent React hook.'
order: 3
updatedAt: '2026-03-20'
---

Vista provides native streaming from the server all the way to the client UI with zero boilerplate.

## Server-Side Streaming

Agents expose a `.stream()` method that returns an `AgentStream`. You can directly return standard Web `Response` objects from your `route.ts` API handlers:

```typescript title="app/api/chat/route.ts"
import { supportAgent } from '@/app/agents/support/agent';

export async function POST(req: Request) {
  const { prompt, messages, sessionId } = await req.json();

  // Create real-time agent stream
  const stream = supportAgent.stream({
    prompt,
    messages,
    sessionId,
  });

  // Returns SSE text/event-stream response
  return stream.toDataStreamResponse();
}
```

### Response Formats

- `stream.toDataStreamResponse()`: Encodes Server-Sent Events (SSE) with structured JSON events (`text-delta`, `tool-call`, `tool-result`, `done`).
- `stream.toTextStreamResponse()`: Returns raw plaintext stream (`text/plain; charset=utf-8`).

## Client-Side UI Integration (`useAgent`)

Import the `useAgent` hook from `@vistagenic/vista/ai/react` in any Client Component (`'use client'`):

```tsx title="app/components/chat-box.tsx"
'use client';

import { useAgent } from '@vistagenic/vista/ai/react';

export function ChatBox() {
  const {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    reload,
    error,
  } = useAgent({
    api: '/api/chat',
    sessionId: 'user-session-123',
    onFinish: (message) => {
      console.log('Finished streaming:', message.content);
    },
  });

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-4">
      <div className="flex-1 overflow-y-auto space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg ${
              m.role === 'user'
                ? 'bg-blue-600 text-white self-end ml-auto'
                : 'bg-zinc-800 text-zinc-100'
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">
              {m.role}
            </p>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}

        {isLoading && <div className="text-zinc-400 text-sm italic">Agent is thinking...</div>}

        {error && <div className="text-red-400 text-sm">Error: {error.message}</div>}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask anything..."
          className="flex-1 p-2 rounded bg-zinc-900 border border-zinc-700 text-white"
          disabled={isLoading}
        />
        {isLoading ? (
          <button
            type="button"
            onClick={stop}
            className="px-4 py-2 bg-red-600 rounded text-white font-medium"
          >
            Stop
          </button>
        ) : (
          <button type="submit" className="px-4 py-2 bg-blue-600 rounded text-white font-medium">
            Send
          </button>
        )}
      </form>
    </div>
  );
}
```

## Related

- [AI Framework Overview](/docs/ai/overview)
- [Defining Agents & Tools](/docs/ai/agents)
- [Model Providers](/docs/ai/providers)
