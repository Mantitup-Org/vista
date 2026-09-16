export function createReadableTextStream(
  chunks: string[] | AsyncIterable<string>
): ReadableStream<string> {
  if (Array.isArray(chunks)) {
    let index = 0;
    return new ReadableStream<string>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index++]);
        } else {
          controller.close();
        }
      },
    });
  }

  const iterator = chunks[Symbol.asyncIterator]();
  return new ReadableStream<string>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export function toTextStreamResponse(
  stream: ReadableStream<string>,
  init?: ResponseInit
): Response {
  const encoder = new TextEncoder();
  const byteStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          if (value) {
            controller.enqueue(encoder.encode(value));
          }
        }
      } catch (err) {
        controller.error(err);
      }
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

export function toDataStreamResponse(
  stream: ReadableStream<string>,
  init?: ResponseInit
): Response {
  const encoder = new TextEncoder();
  const byteStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            break;
          }
          if (value) {
            controller.enqueue(encoder.encode(`0:${JSON.stringify(value)}\n`));
          }
        }
      } catch (err) {
        controller.error(err);
      }
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
