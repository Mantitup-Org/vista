"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgent = void 0;
exports.agent = agent;
const providers_1 = require("./providers");
const memory_1 = require("./memory");
const stream_1 = require("./stream");
/** Strip provider prefix from model spec (e.g. "openai:gpt-4o" -> "gpt-4o") */
function stripProviderPrefix(model) {
    const idx = model.indexOf(':');
    if (idx === -1)
        return model;
    return model.slice(idx + 1) || model;
}
/** Validate tool arguments against a JSON Schema (required fields + basic types). */
function validateToolArgs(args, schema, toolName) {
    if (!schema || typeof schema !== 'object')
        return null;
    const required = schema.required ?? [];
    for (const field of required) {
        if (!(field in args)) {
            return `Tool "${toolName}" missing required parameter: "${field}"`;
        }
    }
    const props = schema.properties ?? {};
    for (const [key, def] of Object.entries(props)) {
        if (key in args && def.type) {
            const actualType = Array.isArray(args[key]) ? 'array' : typeof args[key];
            if (actualType !== def.type) {
                return `Tool "${toolName}" parameter "${key}" expected type "${def.type}" but got "${actualType}"`;
            }
        }
    }
    return null;
}
const MAX_TOOL_ITERATIONS = 5;
function agent(config) {
    if (!config.model) {
        throw new Error('[vista/ai] Agent must specify a "model"');
    }
    const name = config.name || 'agent';
    const model = config.model;
    const systemPrompt = config.systemPrompt || config.system;
    const tools = config.tools || [];
    const memory = config.memory === true
        ? new memory_1.InMemoryHistory()
        : config.memory && typeof config.memory === 'object'
            ? config.memory
            : undefined;
    const provider = (0, providers_1.resolveProvider)(model);
    // The model name passed to the provider must not include the provider prefix.
    const resolvedModelName = typeof model === 'string' ? stripProviderPrefix(model) : provider.name;
    async function buildMessages(runOpts) {
        const sessionId = runOpts.sessionId || 'default';
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        if (memory) {
            const history = await memory.getMessages(sessionId);
            messages.push(...history);
        }
        if (runOpts.messages && runOpts.messages.length > 0) {
            messages.push(...runOpts.messages);
        }
        if (runOpts.prompt) {
            const userMessage = { role: 'user', content: runOpts.prompt };
            messages.push(userMessage);
            if (memory) {
                await memory.addMessage(userMessage, sessionId);
            }
        }
        return { messages, sessionId };
    }
    async function executeToolCalls(toolCalls) {
        const results = [];
        for (const call of toolCalls) {
            const toolDef = tools.find((t) => t.name === call.function.name);
            if (!toolDef) {
                results.push({
                    toolCallId: call.id,
                    toolName: call.function.name,
                    result: null,
                    error: `Tool "${call.function.name}" not found on agent "${name}"`,
                });
                continue;
            }
            try {
                const rawArgs = call.function.arguments;
                const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
                // Validate args against the tool's JSON Schema before execution
                const validationError = validateToolArgs(args, toolDef.parameters, toolDef.name);
                if (validationError) {
                    results.push({
                        toolCallId: call.id,
                        toolName: toolDef.name,
                        result: null,
                        error: validationError,
                    });
                    continue;
                }
                const result = await toolDef.execute(args);
                results.push({
                    toolCallId: call.id,
                    toolName: toolDef.name,
                    result,
                });
            }
            catch (err) {
                results.push({
                    toolCallId: call.id,
                    toolName: toolDef.name,
                    result: null,
                    error: err?.message ?? String(err),
                });
            }
        }
        return results;
    }
    async function generate(options) {
        const runOpts = typeof options === 'string' ? { prompt: options } : options;
        const { messages, sessionId } = await buildMessages(runOpts);
        // Conversation loop: keep running until the model stops requesting tools.
        const conversationMessages = [...messages];
        // Accumulate all tool calls and results across iterations so callers can inspect them.
        const allToolCalls = [];
        const allToolResults = [];
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
            const result = await provider.generate({
                model: resolvedModelName,
                messages: conversationMessages,
                tools,
                temperature: runOpts.temperature ?? config.temperature,
                maxTokens: runOpts.maxTokens ?? config.maxTokens,
            });
            if (result.toolCalls && result.toolCalls.length > 0) {
                const toolResults = await executeToolCalls(result.toolCalls);
                result.toolResults = toolResults;
                // Accumulate across iterations
                allToolCalls.push(...result.toolCalls);
                allToolResults.push(...toolResults);
                // Record assistant turn with tool calls
                const assistantMessage = {
                    role: 'assistant',
                    content: result.text,
                    toolCalls: result.toolCalls,
                };
                conversationMessages.push(assistantMessage);
                if (memory) {
                    await memory.addMessage(assistantMessage, sessionId);
                }
                // Record tool result messages and add to conversation
                for (const tr of toolResults) {
                    const toolMessage = {
                        role: 'tool',
                        name: tr.toolName,
                        toolCallId: tr.toolCallId,
                        content: JSON.stringify(tr.result ?? { error: tr.error }),
                    };
                    conversationMessages.push(toolMessage);
                    if (memory) {
                        await memory.addMessage(toolMessage, sessionId);
                    }
                }
                // Loop back to let the model produce its final answer
                continue;
            }
            // No more tool calls — record assistant response and return
            if (memory && result.text) {
                await memory.addMessage({
                    role: 'assistant',
                    content: result.text,
                }, sessionId);
            }
            // Merge accumulated tool call info into the final result
            if (allToolCalls.length > 0) {
                result.toolCalls = allToolCalls;
                result.toolResults = allToolResults;
            }
            return result;
        }
        // Exceeded max iterations — build merged final result
        const lastResult = {
            text: allToolResults.length > 0
                ? JSON.stringify(allToolResults[allToolResults.length - 1].result ?? '')
                : '',
            toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
            toolResults: allToolResults.length > 0 ? allToolResults : undefined,
            finishReason: 'length',
        };
        return lastResult;
    }
    async function stream(options) {
        const runOpts = typeof options === 'string' ? { prompt: options } : options;
        const { messages, sessionId } = await buildMessages(runOpts);
        // If this agent has tools, we must run the tool loop synchronously first
        // (since streaming providers emit text-only and ignore delta.tool_calls).
        // Execute tool calls via generate() then stream the final text response.
        if (tools.length > 0) {
            const result = await generate(runOpts);
            const finalText = result.text || '';
            // Stream the final text as a single-chunk ReadableStream
            const rawStream = new ReadableStream({
                start(controller) {
                    if (finalText)
                        controller.enqueue(finalText);
                    controller.close();
                },
            });
            const [stream1, stream2] = rawStream.tee();
            return {
                textStream: stream1,
                toTextStreamResponse(init) {
                    return (0, stream_1.toTextStreamResponse)(stream2, init);
                },
                toDataStreamResponse(init) {
                    return (0, stream_1.toDataStreamResponse)(stream2, init);
                },
            };
        }
        const rawStream = await provider.stream({
            model: resolvedModelName,
            messages,
            tools,
            temperature: runOpts.temperature ?? config.temperature,
            maxTokens: runOpts.maxTokens ?? config.maxTokens,
        });
        // Wrap the stream in a passthrough that collects text for memory recording.
        // This avoids tee() race conditions where fire-and-forget memory writes
        // happen after clearMemory() is called by the consumer.
        let collectedText = '';
        const memoryCapturingStream = new TransformStream({
            transform(chunk, controller) {
                collectedText += chunk;
                controller.enqueue(chunk);
            },
            async flush(_controller) {
                if (memory && collectedText) {
                    try {
                        await memory.addMessage({ role: 'assistant', content: collectedText }, sessionId);
                    }
                    catch {
                        // Memory recording is best-effort
                    }
                }
            },
        });
        const textStream = rawStream.pipeThrough(memoryCapturingStream);
        // Tee into two independent branches:
        //   stream1 — returned as textStream for direct consumer reading
        //   stream2 — used by toTextStreamResponse / toDataStreamResponse helpers
        const [stream1, stream2] = textStream.tee();
        return {
            textStream: stream1,
            toTextStreamResponse(init) {
                return (0, stream_1.toTextStreamResponse)(stream2, init);
            },
            toDataStreamResponse(init) {
                return (0, stream_1.toDataStreamResponse)(stream2, init);
            },
        };
    }
    return {
        name,
        model,
        systemPrompt,
        tools,
        memory,
        run: generate,
        generate,
        stream,
        async getHistory(sessionId = 'default') {
            if (!memory)
                return [];
            return await memory.getMessages(sessionId);
        },
        async clearMemory(sessionId = 'default') {
            if (!memory)
                return;
            await memory.clear(sessionId);
        },
        async addMessage(message, sessionId = 'default') {
            if (!memory)
                return;
            await memory.addMessage(message, sessionId);
        },
    };
}
exports.createAgent = agent;
