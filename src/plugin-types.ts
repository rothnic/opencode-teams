/**
 * Type definitions for OpenCode plugin development
 * Based on OpenCode plugin API documentation
 */

export interface Plugin {
  (ctx: PluginContext): Promise<PluginHooks>;
}

export interface PluginContext {
  project: any;
  client: {
    app: {
      log(params: { service: string; level: string; message: string; extra?: any }): Promise<void>;
    };
  };
  $: any;
  directory: string;
  worktree: string;
}

export interface PluginHooks {
  tool?: Record<string, ToolDefinition>;
  'session.created'?: (event: any) => Promise<void>;
  'session.deleted'?: (event: any) => Promise<void>;
  'tool.execute.before'?: (input: any, output: any) => Promise<void>;
  [key: string]: any;
}

export interface ToolDefinition {
  description: string;
  args: Record<string, any>;
  execute(args: any, ctx: any): Promise<any>;
}

export interface SchemaType {
  type?: string;
  properties?: any;
  items?: any;
  description?: string;
  optional?: boolean | (() => SchemaType);
  describe?: (desc: string) => SchemaType;
}

/**
 * Schema builder for tool arguments
 * Mimics Zod-style API
 */
export const schema = {
  string: (): any => ({
    type: 'string',
    optional: () => ({ type: 'string', optional: true }),
    describe: (desc: string) => ({ type: 'string', description: desc }),
  }),
  number: (): any => ({
    type: 'number',
    optional: () => ({ type: 'number', optional: true }),
    describe: (desc: string) => ({ type: 'number', description: desc }),
  }),
  object: (shape: any): any => ({
    type: 'object',
    properties: shape,
    optional: () => ({ type: 'object', properties: shape, optional: true }),
    describe: (desc: string) => ({ type: 'object', properties: shape, description: desc }),
  }),
  array: (item: any): any => ({
    type: 'array',
    items: item,
    optional: () => ({ type: 'array', items: item, optional: true }),
    describe: (desc: string) => ({ type: 'array', items: item, description: desc }),
  }),
};

/**
 * Tool helper function
 */
export function tool(config: {
  description: string;
  args: Record<string, any>;
  execute(args: any, ctx: any): Promise<any>;
}): ToolDefinition {
  return {
    description: config.description,
    args: config.args,
    execute: config.execute,
  };
}

// Attach schema to tool for tool.schema.string() syntax
(tool as any).schema = schema;
