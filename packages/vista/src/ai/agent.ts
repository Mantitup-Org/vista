import { resolveProvider } from './providers';

export interface AgentOptions {
  /** The name of the agent */
  name: string;
  /** The model string, e.g. "openai:gpt-4o" */
  model: string;
  /** System prompt or instructions for the agent */
  system?: string;
  /** Optional tools the agent can use */
  tools?: Record<string, any>;
  /** Whether the agent should manage its own memory/history (default: false) */
  memory?: boolean;
}

export interface AgentRunOptions {
  /** The user prompt */
  prompt: string;
  /** Optional chat history if providing it externally */
  history?: any[];
  /** Whether to stream the response (default: false) */
  stream?: boolean;
}

/**
 * Creates an AI agent configured with a specific model and tools.
 */
export function agent(options: AgentOptions) {
  // If memory is enabled, we keep an internal array of messages.
  const internalMemory: any[] = [];

  return async function run(runOptions: AgentRunOptions | string) {
    const promptString = typeof runOptions === 'string' ? runOptions : runOptions.prompt;
    const history = typeof runOptions === 'string' ? undefined : runOptions.history;
    const shouldStream = typeof runOptions === 'string' ? false : runOptions.stream;

    const languageModel = await resolveProvider(options.model);
    // Dynamically import ai to avoid CommonJS/ESM sync require issues
    const { generateText, streamText } = await import('ai');

    // Build the messages array
    const messages: any[] = [];
    
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }

    if (history) {
      messages.push(...history);
    } else if (options.memory) {
      messages.push(...internalMemory);
    }

    messages.push({ role: 'user', content: promptString });

    if (shouldStream) {
      const result = await streamText({
        model: languageModel,
        messages,
        tools: options.tools,
        onFinish: ({ responseMessages }: any) => {
          if (options.memory) {
            internalMemory.push({ role: 'user', content: promptString });
            internalMemory.push(...responseMessages);
          }
        }
      });
      return result;
    } else {
      const result = await generateText({
        model: languageModel,
        messages,
        tools: options.tools,
      });

      if (options.memory) {
        internalMemory.push({ role: 'user', content: promptString });
        internalMemory.push(...result.responseMessages);
      }

      return result;
    }
  };
}
