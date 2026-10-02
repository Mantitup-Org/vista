# AI

Import app code from `vista/ai` and React hooks from `vista/ai/react`. Do not add a third-party agent SDK for these primitives.

## Model strings

`provider:model`:

- `openai:gpt-4o` (`OPENAI_API_KEY`)
- `anthropic:claude-3-5-sonnet` (`ANTHROPIC_API_KEY`)
- `gemini:gemini-1.5-flash` (`GEMINI_API_KEY`)
- `ollama:llama3`
- `groq:llama-3.1-8b-instant` (`GROQ_API_KEY`)
- `nvidia:meta/llama-3.1-8b-instruct` (`NVIDIA_API_KEY` or `NIM_API_KEY`)
- `mock:echo` for tests with no key

Do not commit API keys or `.env` files.

## Agent

`vista g agent support` writes the files. The generated module looks like this:

```ts
import { agent, tool } from 'vista/ai';

export const supportAgent = agent({
  name: 'support',
  model: process.env.VISTA_AI_MODEL || 'openai:gpt-4o',
  systemPrompt: 'You are a helpful AI assistant for support.',
  tools: [
    tool({
      name: 'ping',
      description: 'Check agent connectivity',
      execute: async () => ({ status: 'ok', time: new Date().toISOString() }),
    }),
  ],
  memory: true,
});
```

Route:

```ts
import { supportAgent } from '../../../agents/support/agent';

export async function POST(req: Request) {
  const { prompt, messages, sessionId } = await req.json();
  const stream = supportAgent.stream({ prompt, messages, sessionId });
  return stream.toDataStreamResponse();
}
```

Client:

```tsx
'use client';
import { useAgent } from 'vista/ai/react';

export default function ChatPage() {
  const { messages, input, setInput, handleSubmit, isLoading } = useAgent({
    api: '/api/agents/support',
  });
  // render messages and a form that calls handleSubmit
}
```

`agent()` options used by the framework: `name`, `model`, `systemPrompt`, `tools`, `memory`, `maxSteps` (default 5), `temperature`, `observability`. Turn another agent into a tool with `.asTool({ description })`.

`tool()` takes `name`, `description`, optional JSON-schema `parameters`, and `execute`.
