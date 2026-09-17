import { AgentStream } from './stream';
import type { AgentConfig, AgentExecutionResult, Message, ToolDefinition } from './types';
export interface AgentRunOptions {
    prompt?: string;
    messages?: Message[];
    sessionId?: string;
    abortSignal?: AbortSignal;
}
export declare class Agent {
    readonly name: string;
    private model;
    private config;
    private toolsMap;
    private memory?;
    constructor(config: AgentConfig);
    private resolveSystemPrompt;
    private normalizeInput;
    /**
     * Run the agent through a multi-step reasoning and tool-execution loop.
     */
    run(input: string | Message[] | AgentRunOptions): Promise<AgentExecutionResult>;
    /**
     * Stream the agent's response, yielding real-time text deltas and tool events.
     */
    stream(input: string | Message[] | AgentRunOptions): AgentStream;
    /**
     * Composes this agent as a callable Tool for another agent (multi-agent hierarchy).
     */
    asTool(options?: {
        name?: string;
        description?: string;
    }): ToolDefinition;
}
/**
 * Creates a Vista AI Agent instance.
 */
export declare function agent(config: AgentConfig): Agent;
