declare module 'node-plop' {
  export interface NodePlopAction {
    type: string;
    [key: string]: unknown;
  }

  export interface NodePlopGeneratorConfig {
    description?: string;
    prompts?: unknown[];
    actions?: NodePlopAction[] | ((answers: unknown) => Array<NodePlopAction | string>);
  }

  export interface NodePlopAPI {
    setHelper(name: string, fn: (...args: unknown[]) => unknown): void;
    setGenerator(name: string, config: NodePlopGeneratorConfig): void;
    getDestBasePath?(): string;
  }
}
