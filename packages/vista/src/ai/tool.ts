import type { ToolDefinition } from './types';

export function tool<TParams = any, TResult = any>(
  config: ToolDefinition<TParams, TResult>
): ToolDefinition<TParams, TResult> {
  if (!config.name || typeof config.name !== 'string') {
    throw new Error('[vista/ai] Tool must have a valid string "name"');
  }
  if (!config.description || typeof config.description !== 'string') {
    throw new Error('[vista/ai] Tool must have a valid string "description"');
  }
  if (typeof config.execute !== 'function') {
    throw new Error('[vista/ai] Tool must provide an "execute" function');
  }

  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters || { type: 'object', properties: {} },
    execute: config.execute,
  };
}

export const createTool = tool;
