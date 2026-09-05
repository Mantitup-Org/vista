"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentTelemetry = void 0;
class AgentTelemetry {
    startTime = 0;
    endTime = 0;
    steps = [];
    handler;
    constructor(handler) {
        if (typeof handler === 'object' && handler !== null) {
            this.handler = handler;
        }
        else if (handler === true) {
            // Default console logger
            this.handler = {
                onStepStart: (step) => console.log(`[vista:ai] Starting step ${step}...`),
                onToolCall: (call) => console.log(`[vista:ai] Tool call: ${call.name}(${JSON.stringify(call.arguments)})`),
                onToolResult: (res) => console.log(`[vista:ai] Tool result: ${res.name} -> ${JSON.stringify(res.result).slice(0, 80)}`),
                onError: (err) => console.error(`[vista:ai] Error:`, err),
            };
        }
    }
    start() {
        this.startTime = Date.now();
    }
    recordStepStart(stepNumber) {
        this.handler?.onStepStart?.(stepNumber);
    }
    recordToolCall(call) {
        this.handler?.onToolCall?.(call);
    }
    recordToolResult(result) {
        this.handler?.onToolResult?.(result);
    }
    recordStepFinish(step) {
        this.steps.push(step);
        this.handler?.onStepFinish?.(step);
    }
    recordError(error) {
        this.handler?.onError?.(error);
    }
    finish() {
        this.endTime = Date.now();
        const duration = this.endTime - this.startTime;
        const totalUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
        };
        let toolCallsCount = 0;
        for (const step of this.steps) {
            if (step.usage) {
                totalUsage.promptTokens += step.usage.promptTokens;
                totalUsage.completionTokens += step.usage.completionTokens;
                totalUsage.totalTokens += step.usage.totalTokens;
            }
            if (step.toolCalls) {
                toolCallsCount += step.toolCalls.length;
            }
        }
        return {
            totalSteps: this.steps.length,
            totalDurationMs: duration,
            totalUsage,
            toolCallsCount,
        };
    }
}
exports.AgentTelemetry = AgentTelemetry;
