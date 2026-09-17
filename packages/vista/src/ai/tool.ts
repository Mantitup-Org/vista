import type { ToolDefinition, ToolContext } from './types';

export interface ToolOptions<TParams = any, TResult = any> {
  name: string;
  description: string;
  parameters?: any;
  execute: (args: TParams, context?: ToolContext) => Promise<TResult> | TResult;
}

export function tool<TParams = any, TResult = any>(
  options: ToolOptions<TParams, TResult>
): ToolDefinition<TParams, TResult> {
  if (!options.name || typeof options.name !== 'string') {
    throw new Error('Tool must have a valid string name');
  }
  if (!options.description || typeof options.description !== 'string') {
    throw new Error(`Tool "${options.name}" must have a description`);
  }
  if (typeof options.execute !== 'function') {
    throw new Error(`Tool "${options.name}" must have an execute function`);
  }

  return {
    name: options.name,
    description: options.description,
    parameters: options.parameters || { type: 'object', properties: {} },
    execute: options.execute,
  };
}

export function formatToolForOpenAI(tool: ToolDefinition): any {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: 'object', properties: {} },
    },
  };
}

export function formatToolForAnthropic(tool: ToolDefinition): any {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters || { type: 'object', properties: {} },
  };
}

export function formatToolForGemini(tool: ToolDefinition): any {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters || { type: 'object', properties: {} },
  };
}
