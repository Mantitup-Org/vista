import type { DeploymentAdapter } from './types';
export * from './types';
export { nodeAdapter } from './node';
export { vercelAdapter } from './vercel';
export { cloudflareAdapter } from './cloudflare';
export { renderAdapter } from './render';
export { dockerAdapter } from './docker';
export declare const adapters: Record<string, DeploymentAdapter>;
export declare function getAdapter(name: string): DeploymentAdapter | undefined;
