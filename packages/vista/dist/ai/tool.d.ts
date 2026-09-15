import type { ToolDefinition } from './types';
export declare function tool<TParams = any, TResult = any>(config: ToolDefinition<TParams, TResult>): ToolDefinition<TParams, TResult>;
export declare const createTool: typeof tool;
