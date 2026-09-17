import type { StreamChunk, TokenUsage, ToolCall } from './types';
export declare class AgentStream implements AsyncIterable<StreamChunk> {
    private source;
    constructor(source: AsyncIterable<StreamChunk>);
    [Symbol.asyncIterator](): AsyncIterator<StreamChunk>;
    /**
     * Converts the stream into a Server-Sent Events (SSE) Response.
     * Format is compatible with UI clients and standard EventSource.
     */
    toDataStreamResponse(init?: ResponseInit): Response;
    /**
     * Converts the stream into a simple text-only Response stream.
     */
    toTextStreamResponse(init?: ResponseInit): Response;
    /**
     * Collects all text and events from the stream into a single result.
     */
    collect(): Promise<{
        text: string;
        toolCalls: ToolCall[];
        usage?: TokenUsage;
    }>;
}
export declare function createAIStreamResponse(stream: AsyncIterable<StreamChunk> | AgentStream, init?: ResponseInit): Response;
