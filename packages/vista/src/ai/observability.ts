import type { AgentStep, ObservabilityHandler, TokenUsage, ToolCall, ToolResult } from './types';

export interface ObservabilityMetrics {
  totalSteps: number;
  totalDurationMs: number;
  totalUsage: TokenUsage;
  toolCallsCount: number;
}

export class AgentTelemetry {
  private startTime: number = 0;
  private endTime: number = 0;
  private steps: AgentStep[] = [];
  private handler?: ObservabilityHandler;

  constructor(handler?: ObservabilityHandler | boolean) {
    if (typeof handler === 'object' && handler !== null) {
      this.handler = handler;
    } else if (handler === true) {
      // Default console logger
      this.handler = {
        onStepStart: (step) => console.log(`[vista:ai] Starting step ${step}...`),
        onToolCall: (call) =>
          console.log(`[vista:ai] Tool call: ${call.name}(${JSON.stringify(call.arguments)})`),
        onToolResult: (res) =>
          console.log(
            `[vista:ai] Tool result: ${res.name} -> ${JSON.stringify(res.result).slice(0, 80)}`
          ),
        onError: (err) => console.error(`[vista:ai] Error:`, err),
      };
    }
  }

  start(): void {
    this.startTime = Date.now();
  }

  recordStepStart(stepNumber: number): void {
    this.handler?.onStepStart?.(stepNumber);
  }

  recordToolCall(call: ToolCall): void {
    this.handler?.onToolCall?.(call);
  }

  recordToolResult(result: ToolResult): void {
    this.handler?.onToolResult?.(result);
  }

  recordStepFinish(step: AgentStep): void {
    this.steps.push(step);
    this.handler?.onStepFinish?.(step);
  }

  recordError(error: Error): void {
    this.handler?.onError?.(error);
  }

  finish(): ObservabilityMetrics {
    this.endTime = Date.now();
    const duration = this.endTime - this.startTime;

    const totalUsage: TokenUsage = {
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
