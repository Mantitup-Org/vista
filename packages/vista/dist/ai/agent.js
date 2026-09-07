"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = void 0;
exports.agent = agent;
const memory_1 = require("./memory");
const observe_1 = require("./observe");
const providers_1 = require("./providers");
function emptyUsage() {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
function addUsage(left, right) {
    return {
        inputTokens: left.inputTokens + right.inputTokens,
        outputTokens: left.outputTokens + right.outputTokens,
        totalTokens: left.totalTokens + right.totalTokens,
    };
}
async function runTool(tool, call) {
    const result = await tool.execute(call.arguments);
    if (typeof result === 'string')
        return result;
    try {
        return JSON.stringify(result);
    }
    catch {
        return String(result);
    }
}
class Agent {
    name;
    model;
    instructions;
    tools;
    temperature;
    maxSteps;
    memoryEnabled;
    memory;
    onObservation;
    constructor(config) {
        if (!config?.name) {
            throw new Error('vista/ai agent() requires a name.');
        }
        if (!config.model) {
            throw new Error(`vista/ai agent "${config.name}" requires a model.`);
        }
        this.name = config.name;
        this.model = config.model;
        this.instructions = config.instructions;
        this.tools = config.tools || [];
        this.temperature = config.temperature;
        this.maxSteps = config.maxSteps ?? 6;
        this.memoryEnabled = Boolean(config.memory);
        this.memory = typeof config.memory === 'object' ? (0, memory_1.createMemory)(config.memory) : (0, memory_1.createMemory)();
        this.onObservation = config.onObservation;
    }
    async generate(options = {}) {
        const startedAt = Date.now();
        const resolved = typeof options === 'string' ? { input: options } : options;
        const { provider, modelId } = (0, providers_1.resolveProvider)(this.model);
        const toolCalls = [];
        const toolTimings = [];
        let usage = emptyUsage();
        let error;
        const history = resolved.sessionId && this.memoryEnabled
            ? await this.memory.get(resolved.sessionId)
            : [];
        const messages = [
            ...(this.instructions ? [{ role: 'system', content: this.instructions }] : []),
            ...history,
            ...(resolved.messages || []),
            ...(resolved.input ? [{ role: 'user', content: resolved.input }] : []),
        ];
        if (messages.filter((message) => message.role !== 'system').length === 0) {
            throw new Error(`Agent "${this.name}" requires input or messages.`);
        }
        try {
            for (let step = 0; step < this.maxSteps; step++) {
                const response = await provider.complete({
                    model: modelId,
                    messages,
                    tools: this.tools,
                    temperature: this.temperature,
                });
                usage = addUsage(usage, response.usage);
                if (response.toolCalls.length > 0) {
                    for (const call of response.toolCalls) {
                        toolCalls.push(call);
                        const tool = this.tools.find((entry) => entry.name === call.name);
                        const toolStarted = Date.now();
                        const toolResult = tool
                            ? await runTool(tool, call)
                            : `Unknown tool: ${call.name}`;
                        toolTimings.push({ name: call.name, ms: Date.now() - toolStarted });
                        messages.push({
                            role: 'assistant',
                            content: response.text || '',
                        });
                        messages.push({
                            role: 'tool',
                            name: call.name,
                            toolCallId: call.id,
                            content: toolResult,
                        });
                    }
                    continue;
                }
                messages.push({ role: 'assistant', content: response.text });
                const persistable = messages.filter((message) => message.role !== 'system');
                if (resolved.sessionId && this.memoryEnabled) {
                    await this.memory.set(resolved.sessionId, persistable);
                }
                const observation = this.observe({
                    modelId,
                    startedAt,
                    steps: step + 1,
                    toolTimings,
                    usage,
                });
                return {
                    text: response.text,
                    messages: persistable,
                    toolCalls,
                    usage,
                    observation,
                };
            }
            error = `Agent "${this.name}" exceeded maxSteps (${this.maxSteps}).`;
            throw new Error(error);
        }
        catch (caught) {
            error = caught?.message || String(caught);
            this.observe({
                modelId,
                startedAt,
                steps: toolCalls.length + 1,
                toolTimings,
                usage,
                error,
            });
            throw caught;
        }
    }
    async *stream(options = {}) {
        try {
            const result = await this.generate(options);
            if (result.text) {
                yield { type: 'text-delta', text: result.text };
            }
            for (const toolCall of result.toolCalls) {
                yield { type: 'tool-call', toolCall };
            }
            yield { type: 'usage', usage: result.usage };
            yield { type: 'done' };
        }
        catch (error) {
            yield { type: 'error', error: error?.message || String(error) };
        }
    }
    observe(input) {
        const observation = {
            agent: this.name,
            model: input.modelId,
            latencyMs: Date.now() - input.startedAt,
            steps: input.steps,
            toolCalls: input.toolTimings,
            usage: input.usage,
            costUsd: (0, observe_1.estimateCostUsd)(input.modelId, input.usage),
            error: input.error,
        };
        (0, observe_1.emitAgentObservation)(observation);
        this.onObservation?.(observation);
        return observation;
    }
}
exports.Agent = Agent;
function agent(config) {
    return new Agent(config);
}
