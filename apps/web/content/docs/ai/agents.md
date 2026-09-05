---
category: 'ai'
slug: 'agents'
title: 'Defining Agents & Tools'
summary: 'Learn how to configure agents, multi-step tool reasoning loops, and multi-agent hierarchies in Vista.'
order: 2
updatedAt: '2026-03-20'
---

Agents in Vista are autonomous computational units that can reason, invoke tools in multi-step loops, maintain conversation memory, and collaborate with other agents.

## Creating an Agent

Use the `agent()` factory from `@vistagenic/vista/ai`:

```typescript
import { agent } from '@vistagenic/vista/ai';

export const myAgent = agent({
  name: 'analyst',
  model: 'openai:gpt-4o',
  systemPrompt: 'You are an expert data analyst.',
  tools: [
    /* tools here */
  ],
  memory: true,
  maxSteps: 5,
  temperature: 0.2,
});
```

### Configuration Options

| Option          | Type                                | Description                                                                |
| --------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `name`          | `string`                            | Unique name identifying the agent                                          |
| `model`         | `string \| LanguageModel`           | Model identifier string (e.g. `'openai:gpt-4o'`) or custom `LanguageModel` |
| `systemPrompt`  | `string \| (() => Promise<string>)` | Static system prompt or dynamic generator function                         |
| `tools`         | `ToolDefinition[]`                  | List of tools callable by the agent                                        |
| `memory`        | `boolean \| AgentMemory`            | Enable session memory (`true` uses `defaultMemoryStore`)                   |
| `maxSteps`      | `number`                            | Maximum tool execution loops before returning (default: 5)                 |
| `temperature`   | `number`                            | Model sampling temperature (0.0 to 1.0)                                    |
| `observability` | `boolean \| ObservabilityHandler`   | Telemetry handler for step and tool call tracking                          |

## Defining Tools

Tools allow agents to interact with external APIs, databases, or local code. Create tools using `tool()`:

```typescript
import { tool } from '@vistagenic/vista/ai';

export const fetchStockPrice = tool({
  name: 'get_stock_price',
  description: 'Fetch the real-time stock price for a ticker symbol.',
  parameters: {
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker e.g. AAPL, NVDA' },
    },
    required: ['ticker'],
  },
  execute: async ({ ticker }, context) => {
    // Perform API fetch or DB query
    const res = await fetch(`https://api.example.com/stocks/${ticker}`);
    return await res.json();
  },
});
```

## Multi-Step Reasoning Loop

When an agent runs, it automatically executes a multi-step loop:

1. Prompts the language model with system prompt, history, and available tool definitions.
2. If the model emits tool calls, Vista executes the tools in parallel or sequence and appends the results to the context.
3. Vista re-prompts the model with the tool results so it can reason over the output.
4. The loop continues until the model returns a final text answer or reaches `maxSteps`.

```typescript
const result = await myAgent.run('What is the current price of NVDA?');
console.log(result.text);
console.log('Steps taken:', result.steps.length);
```

## Multi-Agent Hierarchies

An agent can easily be converted into a tool for another agent using `.asTool()`:

```typescript
import { agent } from '@vistagenic/vista/ai';

// 1. Specialized researcher agent
export const researcherAgent = agent({
  name: 'researcher',
  model: 'anthropic:claude-3-5-sonnet',
  systemPrompt: 'You specialize in academic and technical literature search.',
  tools: [
    /* search tools */
  ],
});

// 2. High-level orchestrator agent
export const managerAgent = agent({
  name: 'manager',
  model: 'openai:gpt-4o',
  systemPrompt: 'You coordinate research and write executive summaries.',
  tools: [
    researcherAgent.asTool({
      description: 'Delegate technical research queries to the researcher agent.',
    }),
  ],
});
```

## Related

- [AI Framework Overview](/docs/ai/overview)
- [Streaming & UI Hooks](/docs/ai/streaming)
- [Model Providers](/docs/ai/providers)
