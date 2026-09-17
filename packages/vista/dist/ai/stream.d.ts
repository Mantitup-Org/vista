export declare function createReadableTextStream(chunks: string[] | AsyncIterable<string>): ReadableStream<string>;
export declare function toTextStreamResponse(stream: ReadableStream<string>, init?: ResponseInit): Response;
export declare function toDataStreamResponse(stream: ReadableStream<string>, init?: ResponseInit): Response;
