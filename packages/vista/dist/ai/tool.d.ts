import type { ToolDefinition } from './types';
export declare function tool<TArgs extends Record<string, unknown> = Record<string, unknown>, TResult = unknown>(definition: ToolDefinition<TArgs, TResult>): ToolDefinition<TArgs, TResult>;
