"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgent = void 0;
exports.agent = agent;
const providers_1 = require("./providers");
const memory_1 = require("./memory");
const stream_1 = require("./stream");
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
        const modelName = typeof model === 'string' ? model : provider.name;
        const result = await provider.generate({
            model: modelName,
            messages,
            tools,
            temperature: runOpts.temperature ?? config.temperature,
            maxTokens: runOpts.maxTokens ?? config.maxTokens,
        });
        if (result.toolCalls && result.toolCalls.length > 0) {
            const toolResults = await executeToolCalls(result.toolCalls);
            result.toolResults = toolResults;
            // Feed tool results back to memory if active
            if (memory) {
                await memory.addMessage({
                    role: 'assistant',
                    content: result.text,
                    toolCalls: result.toolCalls,
                }, sessionId);
                for (const tr of toolResults) {
                    await memory.addMessage({
                        role: 'tool',
                        name: tr.toolName,
                        toolCallId: tr.toolCallId,
                        content: JSON.stringify(tr.result ?? { error: tr.error }),
                    }, sessionId);
                }
            }
        }
        else if (memory && result.text) {
            await memory.addMessage({
                role: 'assistant',
                content: result.text,
            }, sessionId);
        }
        return result;
    }
    async function stream(options) {
        const runOpts = typeof options === 'string' ? { prompt: options } : options;
        const { messages } = await buildMessages(runOpts);
        const modelName = typeof model === 'string' ? model : provider.name;
        const textStream = await provider.stream({
            model: modelName,
            messages,
            tools,
            temperature: runOpts.temperature ?? config.temperature,
            maxTokens: runOpts.maxTokens ?? config.maxTokens,
        });
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
