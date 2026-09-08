import type { ResolvedDeployTarget } from '../types';
import { cloudflareAdapter } from './cloudflare';
import { dockerAdapter } from './docker';
import { netlifyAdapter } from './netlify';
import { renderAdapter } from './render';
import { vercelAdapter } from './vercel';

export const deployAdapters = {
  render: renderAdapter,
  vercel: vercelAdapter,
  cloudflare: cloudflareAdapter,
  netlify: netlifyAdapter,
  docker: dockerAdapter,
} as const;

export function getDeployAdapter(target: ResolvedDeployTarget) {
  return deployAdapters[target];
}

export { cloudflareAdapter, dockerAdapter, netlifyAdapter, renderAdapter, vercelAdapter };
