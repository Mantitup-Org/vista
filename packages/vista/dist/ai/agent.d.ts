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
export declare function agent(options: AgentOptions): (runOptions: AgentRunOptions | string) => Promise<import("ai", { with: { "resolution-mode": "import" } }).StreamTextResult<Record<string, any>, import("@ai-sdk/provider-utils", { with: { "resolution-mode": "import" } }).Context, import("ai", { with: { "resolution-mode": "import" } }).OutputInterface<string, string, never>> | import("ai", { with: { "resolution-mode": "import" } }).GenerateTextResult<Record<string, any>, import("@ai-sdk/provider-utils", { with: { "resolution-mode": "import" } }).Context, import("ai", { with: { "resolution-mode": "import" } }).OutputInterface<string, string, any>>>;
