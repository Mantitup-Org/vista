import type { ToolDefinition } from './types';

export function tool<TArgs extends Record<string, unknown> = Record<string, unknown>, TResult = unknown>(
  definition: ToolDefinition<TArgs, TResult>
): ToolDefinition<TArgs, TResult> {
  if (!definition?.name) {
    throw new Error('vista/ai tool() requires a name.');
  }
  if (typeof definition.execute !== 'function') {
    throw new Error(`vista/ai tool "${definition.name}" requires an execute() function.`);
  }
  return definition;
}
