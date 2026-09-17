"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = void 0;
exports.agent = agent;
const base_1 = require("./providers/base");
const memory_1 = require("./memory");
const stream_1 = require("./stream");
const observability_1 = require("./observability");
const tool_1 = require("./tool");
class Agent {
    name;
    model;
    config;
    toolsMap;
    memory;
    constructor(config) {
        if (!config.name || typeof config.name !== 'string') {
            throw new Error('Agent must have a valid string name');
        }
        this.name = config.name;
        this.config = config;
        this.model = (0, base_1.resolveModel)(config.model);
        // Initialize tools lookup
        this.toolsMap = new Map();
        if (config.tools) {
            for (const t of config.tools) {
                if (t && typeof t.name === 'string') {
                    this.toolsMap.set(t.name, t);
                }
            }
        }
        // Initialize memory store
        if (config.memory === true) {
            this.memory = memory_1.defaultMemoryStore;
        }
        else if (typeof config.memory === 'object' && config.memory !== null) {
            this.memory = config.memory;
        }
    }
    async resolveSystemPrompt() {
        if (typeof this.config.systemPrompt === 'function') {
            return await this.config.systemPrompt();
        }
        return this.config.systemPrompt;
    }
    normalizeInput(input) {
        if (typeof input === 'string') {
            return { messages: [{ role: 'user', content: input }] };
        }
        if (Array.isArray(input)) {
            return { messages: [...input] };
        }
        const messages = input.messages ? [...input.messages] : [];
        if (input.prompt) {
            messages.push({ role: 'user', content: input.prompt });
        }
        return {
            messages,
            sessionId: input.sessionId,
            abortSignal: input.abortSignal,
        };
    }
    /**
     * Run the agent through a multi-step reasoning and tool-execution loop.
     */
    async run(input) {
        const { messages: incomingMessages, sessionId, abortSignal } = this.normalizeInput(input);
        const telemetry = new observability_1.AgentTelemetry(this.config.observability);
        telemetry.start();
        // Load memory history if session provided
        let conversationHistory = [];
        if (this.memory && sessionId) {
            const stored = await this.memory.get(sessionId);
            conversationHistory = [...stored];
        }
        conversationHistory.push(...incomingMessages);
        const systemPrompt = await this.resolveSystemPrompt();
        const maxSteps = this.config.maxSteps || 5;
        const toolsList = Array.from(this.toolsMap.values());
        const steps = [];
        let currentStep = 1;
        let finalAnswer = '';
        let finishReason = 'stop';
        while (currentStep <= maxSteps) {
            if (abortSignal?.aborted) {
                throw new Error('Agent execution aborted');
            }
            telemetry.recordStepStart(currentStep);
            const stepResult = await this.model.generateText({
                messages: conversationHistory,
                systemPrompt,
                tools: toolsList.length > 0 ? toolsList : undefined,
                temperature: this.config.temperature,
                maxTokens: this.config.maxTokens,
                abortSignal,
            });
            const stepRecord = {
                stepNumber: currentStep,
                prompt: [...conversationHistory],
                text: stepResult.text,
                toolCalls: stepResult.toolCalls,
                usage: stepResult.usage,
            };
            // 1. If no tool calls requested, we have reached the final answer
            if (!stepResult.toolCalls || stepResult.toolCalls.length === 0) {
                finalAnswer = stepResult.text;
                finishReason = stepResult.finishReason || 'stop';
                conversationHistory.push({
                    role: 'assistant',
                    content: finalAnswer,
                });
                telemetry.recordStepFinish(stepRecord);
                steps.push(stepRecord);
                if (this.config.onStepFinish) {
                    await this.config.onStepFinish(stepRecord);
                }
                break;
            }
            // 2. Model requested tool calls
            conversationHistory.push({
                role: 'assistant',
                content: stepResult.text,
                toolCalls: stepResult.toolCalls,
            });
            const toolResults = [];
            for (const call of stepResult.toolCalls) {
                telemetry.recordToolCall(call);
                const registeredTool = this.toolsMap.get(call.name);
                if (!registeredTool) {
                    const errRes = {
                        toolCallId: call.id,
                        name: call.name,
                        result: `Error: Tool "${call.name}" is not registered on agent "${this.name}".`,
                        isError: true,
                    };
                    toolResults.push(errRes);
                    telemetry.recordToolResult(errRes);
                    conversationHistory.push({
                        role: 'tool',
                        name: call.name,
                        toolCallId: call.id,
                        content: errRes.result,
                    });
                    continue;
                }
                const toolCtx = {
                    step: currentStep,
                    messages: conversationHistory,
                    agentName: this.name,
                    abortSignal,
                };
                try {
                    const args = typeof call.arguments === 'object' && call.arguments !== null
                        ? call.arguments
                        : typeof call.arguments === 'string'
                            ? JSON.parse(call.arguments || '{}')
                            : {};
                    const rawOutput = await registeredTool.execute(args, toolCtx);
                    const serializedOutput = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput);
                    const successRes = {
                        toolCallId: call.id,
                        name: call.name,
                        result: rawOutput,
                    };
                    toolResults.push(successRes);
                    telemetry.recordToolResult(successRes);
                    conversationHistory.push({
                        role: 'tool',
                        name: call.name,
                        toolCallId: call.id,
                        content: serializedOutput,
                    });
                }
                catch (toolError) {
                    const errMessage = toolError?.message || 'Tool execution failed';
                    const failureRes = {
                        toolCallId: call.id,
                        name: call.name,
                        result: `Error executing ${call.name}: ${errMessage}`,
                        isError: true,
                    };
                    toolResults.push(failureRes);
                    telemetry.recordToolResult(failureRes);
                    conversationHistory.push({
                        role: 'tool',
                        name: call.name,
                        toolCallId: call.id,
                        content: failureRes.result,
                    });
                }
            }
            stepRecord.toolResults = toolResults;
            telemetry.recordStepFinish(stepRecord);
            steps.push(stepRecord);
            if (this.config.onStepFinish) {
                await this.config.onStepFinish(stepRecord);
            }
            currentStep++;
            if (currentStep > maxSteps) {
                finishReason = 'length';
                finalAnswer =
                    stepResult.text ||
                        `Agent reached maximum step limit (${maxSteps}) before arriving at final answer.`;
            }
        }
        // Save updated memory if configured
        if (this.memory && sessionId) {
            await this.memory.save(sessionId, conversationHistory);
        }
        const metrics = telemetry.finish();
        return {
            text: finalAnswer,
            messages: conversationHistory,
            steps,
            usage: metrics.totalUsage,
            finishReason,
        };
    }
    /**
     * Stream the agent's response, yielding real-time text deltas and tool events.
     */
    stream(input) {
        const self = this;
        const { messages: incomingMessages, sessionId, abortSignal } = this.normalizeInput(input);
        async function* streamGenerator() {
            // For streaming, we run the agent steps and yield incremental events
            let conversationHistory = [];
            if (self.memory && sessionId) {
                const stored = await self.memory.get(sessionId);
                conversationHistory = [...stored];
            }
            conversationHistory.push(...incomingMessages);
            const systemPrompt = await self.resolveSystemPrompt();
            const maxSteps = self.config.maxSteps || 5;
            const toolsList = Array.from(self.toolsMap.values());
            let currentStep = 1;
            const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
            while (currentStep <= maxSteps) {
                if (abortSignal?.aborted) {
                    yield { type: 'error', error: 'Agent execution aborted' };
                    return;
                }
                // Stream from the underlying model
                const chunks = [];
                let accumulatedText = '';
                const toolCalls = [];
                for await (const chunk of self.model.streamText({
                    messages: conversationHistory,
                    systemPrompt,
                    tools: toolsList.length > 0 ? toolsList : undefined,
                    temperature: self.config.temperature,
                    maxTokens: self.config.maxTokens,
                    abortSignal,
                })) {
                    if (chunk.type === 'text-delta' && chunk.textDelta) {
                        accumulatedText += chunk.textDelta;
                        yield chunk;
                    }
                    else if (chunk.type === 'tool-call' && chunk.toolCall) {
                        toolCalls.push(chunk.toolCall);
                        yield chunk;
                    }
                    else if (chunk.type === 'done' && chunk.usage) {
                        totalUsage.promptTokens += chunk.usage.promptTokens;
                        totalUsage.completionTokens += chunk.usage.completionTokens;
                        totalUsage.totalTokens += chunk.usage.totalTokens;
                    }
                }
                // If no tool calls, generation is complete
                if (toolCalls.length === 0) {
                    conversationHistory.push({
                        role: 'assistant',
                        content: accumulatedText,
                    });
                    yield { type: 'step-finish' };
                    break;
                }
                // Handle tool calls
                conversationHistory.push({
                    role: 'assistant',
                    content: accumulatedText,
                    toolCalls,
                });
                for (const call of toolCalls) {
                    const registeredTool = self.toolsMap.get(call.name);
                    if (!registeredTool) {
                        const errRes = {
                            toolCallId: call.id,
                            name: call.name,
                            result: `Tool "${call.name}" not found`,
                            isError: true,
                        };
                        yield { type: 'tool-result', toolResult: errRes };
                        conversationHistory.push({
                            role: 'tool',
                            name: call.name,
                            toolCallId: call.id,
                            content: errRes.result,
                        });
                        continue;
                    }
                    try {
                        const args = typeof call.arguments === 'object' && call.arguments !== null
                            ? call.arguments
                            : typeof call.arguments === 'string'
                                ? JSON.parse(call.arguments || '{}')
                                : {};
                        const result = await registeredTool.execute(args, {
                            step: currentStep,
                            messages: conversationHistory,
                            agentName: self.name,
                            abortSignal,
                        });
                        const serialized = typeof result === 'string' ? result : JSON.stringify(result);
                        yield {
                            type: 'tool-result',
                            toolResult: { toolCallId: call.id, name: call.name, result },
                        };
                        conversationHistory.push({
                            role: 'tool',
                            name: call.name,
                            toolCallId: call.id,
                            content: serialized,
                        });
                    }
                    catch (err) {
                        const errRes = {
                            toolCallId: call.id,
                            name: call.name,
                            result: err?.message || 'Tool execution error',
                            isError: true,
                        };
                        yield { type: 'tool-result', toolResult: errRes };
                        conversationHistory.push({
                            role: 'tool',
                            name: call.name,
                            toolCallId: call.id,
                            content: errRes.result,
                        });
                    }
                }
                yield { type: 'step-finish' };
                currentStep++;
            }
            if (self.memory && sessionId) {
                await self.memory.save(sessionId, conversationHistory);
            }
            yield { type: 'done', usage: totalUsage };
        }
        return new stream_1.AgentStream(streamGenerator());
    }
    /**
     * Composes this agent as a callable Tool for another agent (multi-agent hierarchy).
     */
    asTool(options) {
        const toolName = options?.name || `ask_${this.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
        const toolDescription = options?.description ||
            `Delegate a question, task, or request to the specialized ${this.name} agent.`;
        return (0, tool_1.tool)({
            name: toolName,
            description: toolDescription,
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: `The query or instruction to give to the ${this.name} agent`,
                    },
                },
                required: ['query'],
            },
            execute: async ({ query }) => {
                const result = await this.run(query);
                return result.text;
            },
        });
    }
}
exports.Agent = Agent;
/**
 * Creates a Vista AI Agent instance.
 */
function agent(config) {
    return new Agent(config);
}
