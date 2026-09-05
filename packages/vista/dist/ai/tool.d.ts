import type { ToolDefinition, ToolContext } from './types';
export interface ToolOptions<TParams = any, TResult = any> {
    name: string;
    description: string;
    parameters?: any;
    execute: (args: TParams, context?: ToolContext) => Promise<TResult> | TResult;
}
export declare function tool<TParams = any, TResult = any>(options: ToolOptions<TParams, TResult>): ToolDefinition<TParams, TResult>;
export declare function formatToolForOpenAI(tool: ToolDefinition): any;
export declare function formatToolForAnthropic(tool: ToolDefinition): any;
export declare function formatToolForGemini(tool: ToolDefinition): any;
