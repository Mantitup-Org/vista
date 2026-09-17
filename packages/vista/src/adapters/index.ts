import type { DeploymentAdapter } from './types';
import { nodeAdapter } from './node';
import { vercelAdapter } from './vercel';
import { cloudflareAdapter } from './cloudflare';
import { renderAdapter } from './render';
import { dockerAdapter } from './docker';
import { netlifyAdapter } from './netlify';

export * from './types';
export { nodeAdapter } from './node';
export { vercelAdapter } from './vercel';
export { cloudflareAdapter } from './cloudflare';
export { renderAdapter } from './render';
export { dockerAdapter } from './docker';
export { netlifyAdapter } from './netlify';

export const adapters: Record<string, DeploymentAdapter> = {
  node: nodeAdapter,
  standalone: nodeAdapter,
  vercel: vercelAdapter,
  cloudflare: cloudflareAdapter,
  'cloudflare-workers': cloudflareAdapter,
  render: renderAdapter,
  docker: dockerAdapter,
  netlify: netlifyAdapter,
};

export function getAdapter(name: string): DeploymentAdapter | undefined {
  return adapters[name.toLowerCase()];
}
