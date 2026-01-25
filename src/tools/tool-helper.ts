/**
 * Tool helper for OpenCode plugin
 * Follows OpenCode's tool registration pattern
 */

export interface ToolDefinition<TArgs = any, TReturn = any> {
  name: string;
  description: string;
  parameters: Record<string, ParameterDefinition>;
  execute: (args: TArgs, context?: any) => Promise<TReturn> | TReturn;
}

export interface ParameterDefinition {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  properties?: Record<string, ParameterDefinition>;
  items?: ParameterDefinition;
}

/**
 * Helper to define a tool following OpenCode conventions
 */
export function tool<TArgs = any, TReturn = any>(config: {
  name: string;
  description: string;
  parameters: Record<string, ParameterDefinition>;
  execute: (args: TArgs, context?: any) => Promise<TReturn> | TReturn;
}): ToolDefinition<TArgs, TReturn> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute,
  };
}
