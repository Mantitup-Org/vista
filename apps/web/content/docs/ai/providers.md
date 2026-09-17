---
category: 'ai'
slug: 'providers'
title: 'Model Providers Configuration'
summary: 'Configure OpenAI, Anthropic, Google Gemini, Ollama, and local models in Vista.'
order: 4
updatedAt: '2026-03-20'
---

Vista AI includes built-in drivers for the most popular language model providers, using standard HTTP `fetch` under the hood.

## Provider Specifiers

Specify models using a simple `provider:model-name` format:

```typescript
// OpenAI
model: 'openai:gpt-4o';
model: 'openai:gpt-4o-mini';

// Anthropic
model: 'anthropic:claude-3-5-sonnet-20241022';
model: 'anthropic:claude-3-5-haiku-20241022';

// Google Gemini
model: 'gemini:gemini-1.5-pro';
model: 'gemini:gemini-1.5-flash';

// Local / Ollama
model: 'ollama:llama3';
model: 'ollama:mistral';

// Mock / Testing
model: 'mock:echo';
```

## Environment Variables

Configure API keys and base URLs in your `.env.local` or deployment platform settings:

```bash title=".env.local"
# OpenAI
OPENAI_API_KEY="sk-..."
OPENAI_BASE_URL="https://api.openai.com/v1" # optional

# Anthropic
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_BASE_URL="https://api.anthropic.com/v1" # optional

# Google Gemini
GEMINI_API_KEY="AIza..."

# Ollama / Local
OLLAMA_BASE_URL="http://localhost:11434/v1" # optional (default)
```

## Custom Provider Options

You can also pass custom configuration directly to `resolveModel` or your agent:

```typescript
import { agent, createOpenAIModel } from '@vistagenic/vista/ai';

export const customAgent = agent({
  name: 'custom',
  model: createOpenAIModel({
    model: 'deepseek-chat',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY,
  }),
});
```

## Related

- [AI Framework Overview](/docs/ai/overview)
- [Defining Agents & Tools](/docs/ai/agents)
- [Streaming & UI Hooks](/docs/ai/streaming)
