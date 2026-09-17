import type { AgentStep, ObservabilityHandler, TokenUsage, ToolCall, ToolResult } from './types';
export interface ObservabilityMetrics {
    totalSteps: number;
    totalDurationMs: number;
    totalUsage: TokenUsage;
    toolCallsCount: number;
}
export declare class AgentTelemetry {
    private startTime;
    private endTime;
    private steps;
    private handler?;
    constructor(handler?: ObservabilityHandler | boolean);
    start(): void;
    recordStepStart(stepNumber: number): void;
    recordToolCall(call: ToolCall): void;
    recordToolResult(result: ToolResult): void;
    recordStepFinish(step: AgentStep): void;
    recordError(error: Error): void;
    finish(): ObservabilityMetrics;
}
