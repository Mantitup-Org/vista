"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReadableTextStream = createReadableTextStream;
exports.toTextStreamResponse = toTextStreamResponse;
exports.toDataStreamResponse = toDataStreamResponse;
function createReadableTextStream(chunks) {
    if (Array.isArray(chunks)) {
        let index = 0;
        return new ReadableStream({
            pull(controller) {
                if (index < chunks.length) {
                    controller.enqueue(chunks[index++]);
                }
                else {
                    controller.close();
                }
            },
        });
    }
    const iterator = chunks[Symbol.asyncIterator]();
    return new ReadableStream({
        async pull(controller) {
            try {
                const { value, done } = await iterator.next();
                if (done) {
                    controller.close();
                }
                else {
                    controller.enqueue(value);
                }
            }
            catch (err) {
                controller.error(err);
            }
        },
    });
}
function toTextStreamResponse(stream, init) {
    const encoder = new TextEncoder();
    const reader = stream.getReader();
    // Pull-based adapter: reads one chunk per pull so slow clients experience
    // bounded memory usage instead of having the entire output queued eagerly.
    const byteStream = new ReadableStream({
        async pull(controller) {
            try {
                const { done, value } = await reader.read();
                if (done) {
                    controller.close();
                }
                else if (value) {
                    controller.enqueue(encoder.encode(value));
                }
            }
            catch (err) {
                controller.error(err);
            }
        },
        cancel() {
            reader.cancel().catch(() => { });
        },
    });
    const headers = new Headers(init?.headers);
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'text/plain; charset=utf-8');
    }
    return new Response(byteStream, {
        ...init,
        headers,
    });
}
function toDataStreamResponse(stream, init) {
    const encoder = new TextEncoder();
    const reader = stream.getReader();
    // Pull-based adapter with proper cancellation so a disconnected client
    // doesn't keep the model output accumulating in memory.
    const byteStream = new ReadableStream({
        async pull(controller) {
            try {
                const { done, value } = await reader.read();
                if (done) {
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    controller.close();
                }
                else if (value) {
                    controller.enqueue(encoder.encode(`0:${JSON.stringify(value)}\n`));
                }
            }
            catch (err) {
                controller.error(err);
            }
        },
        cancel() {
            reader.cancel().catch(() => { });
        },
    });
    const headers = new Headers(init?.headers);
    if (!headers.has('Content-Type')) {
        // The data stream protocol uses line-delimited JSON (0:"chunk"\n), not SSE.
        // text/plain is correct here; text/event-stream would imply EventSource format.
        headers.set('Content-Type', 'text/plain; charset=utf-8');
        headers.set('x-vercel-ai-data-stream', 'v1');
    }
    headers.set('Cache-Control', 'no-cache');
    headers.set('Connection', 'keep-alive');
    return new Response(byteStream, {
        ...init,
        headers,
    });
}
