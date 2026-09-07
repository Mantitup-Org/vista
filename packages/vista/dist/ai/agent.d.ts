import type { AgentConfig, AgentGenerateOptions, AgentGenerateResult, AgentStreamEvent, ModelProvider, ToolDefinition } from './types';
export declare class Agent {
    readonly name: string;
    readonly model: string | ModelProvider;
    readonly instructions?: string;
    readonly tools: ToolDefinition[];
    readonly temperature?: number;
    readonly maxSteps: number;
    private memoryEnabled;
    private memory;
    private onObservation?;
    constructor(config: AgentConfig);
    generate(options?: AgentGenerateOptions | string): Promise<AgentGenerateResult>;
    stream(options?: AgentGenerateOptions | string): AsyncGenerator<AgentStreamEvent>;
    private observe;
}
export declare function agent(config: AgentConfig): Agent;
