"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentStream = void 0;
exports.createAIStreamResponse = createAIStreamResponse;
class AgentStream {
    source;
    constructor(source) {
        this.source = source;
    }
    [Symbol.asyncIterator]() {
        return this.source[Symbol.asyncIterator]();
    }
    /**
     * Converts the stream into a Server-Sent Events (SSE) Response.
     * Format is compatible with UI clients and standard EventSource.
     */
    toDataStreamResponse(init) {
        const encoder = new TextEncoder();
        const iterator = this.source[Symbol.asyncIterator]();
        const stream = new ReadableStream({
            async pull(controller) {
                try {
                    const { value, done } = await iterator.next();
                    if (done) {
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        controller.close();
                        return;
                    }
                    const line = `data: ${JSON.stringify(value)}\n\n`;
                    controller.enqueue(encoder.encode(line));
                }
                catch (error) {
                    const errChunk = {
                        type: 'error',
                        error: error?.message || 'Stream processing error',
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(errChunk)}\n\n`));
                    controller.close();
                }
            },
            async cancel(reason) {
                if (iterator.return) {
                    await iterator.return(reason);
                }
            }
        });
        const headers = new Headers(init?.headers);
        headers.set('Content-Type', 'text/event-stream; charset=utf-8');
        headers.set('Cache-Control', 'no-cache, no-transform');
        headers.set('Connection', 'keep-alive');
        return new Response(stream, {
            ...init,
            status: init?.status ?? 200,
            headers,
        });
    }
    /**
     * Converts the stream into a simple text-only Response stream.
     */
    toTextStreamResponse(init) {
        const encoder = new TextEncoder();
        const iterator = this.source[Symbol.asyncIterator]();
        const stream = new ReadableStream({
            async pull(controller) {
                try {
                    while (true) {
                        const { value, done } = await iterator.next();
                        if (done) {
                            controller.close();
                            return;
                        }
                        if (value.type === 'text-delta' && value.textDelta) {
                            controller.enqueue(encoder.encode(value.textDelta));
                            return;
                        }
                    }
                }
                catch (error) {
                    controller.error(error);
                }
            },
            async cancel(reason) {
                if (iterator.return) {
                    await iterator.return(reason);
                }
            }
        });
        const headers = new Headers(init?.headers);
        if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'text/plain; charset=utf-8');
        }
        headers.set('Cache-Control', 'no-cache');
        return new Response(stream, {
            ...init,
            status: init?.status ?? 200,
            headers,
        });
    }
    /**
     * Collects all text and events from the stream into a single result.
     */
    async collect() {
        let text = '';
        const toolCalls = [];
        let usage;
        for await (const chunk of this.source) {
            if (chunk.type === 'text-delta' && chunk.textDelta) {
                text += chunk.textDelta;
            }
            else if (chunk.type === 'tool-call' && chunk.toolCall) {
                toolCalls.push(chunk.toolCall);
            }
            else if (chunk.type === 'done' && chunk.usage) {
                usage = chunk.usage;
            }
        }
        return { text, toolCalls, usage };
    }
}
exports.AgentStream = AgentStream;
function createAIStreamResponse(stream, init) {
    if (stream instanceof AgentStream) {
        return stream.toDataStreamResponse(init);
    }
    return new AgentStream(stream).toDataStreamResponse(init);
}
