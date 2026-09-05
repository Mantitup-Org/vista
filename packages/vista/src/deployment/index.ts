import type { DeploymentConfig, DeploymentTarget, VistaConfig } from '../config';
import { detectDeploymentTarget, normalizeDeploymentTarget } from './detector';
import type { DeploymentAdapter, DeploymentContext, DeploymentResult } from './types';
import { vercelAdapter } from './adapters/vercel';
import { cloudflareAdapter } from './adapters/cloudflare';
import { renderAdapter } from './adapters/render';
import { dockerAdapter } from './adapters/docker';
import path from 'path';

export * from './types';
export * from './detector';
export { vercelAdapter } from './adapters/vercel';
export { cloudflareAdapter } from './adapters/cloudflare';
export { renderAdapter } from './adapters/render';
export { dockerAdapter } from './adapters/docker';

export const nodeAdapter: DeploymentAdapter = {
  target: 'node',
  name: 'Node.js Standalone Server',
  generate(context: DeploymentContext): DeploymentResult {
    const { vistaDir, debug } = context;
    const standaloneDir = path.join(vistaDir, 'standalone');

    if (debug) {
      console.log(`[vista:deploy:node] Standalone server directory prepared at ${standaloneDir}`);
    }

    return {
      target: 'node',
      success: true,
      outputDirectory: standaloneDir,
      generatedFiles: [],
      notes: [
        'Node.js standalone server ready.',
        'Run in production with: node .vista/standalone/server.js',
      ],
    };
  },
};

const adapters: Record<Exclude<DeploymentTarget, 'auto'>, DeploymentAdapter> = {
  vercel: vercelAdapter,
  cloudflare: cloudflareAdapter,
  render: renderAdapter,
  docker: dockerAdapter,
  node: nodeAdapter,
};

export function getDeploymentAdapter(target: DeploymentTarget): DeploymentAdapter | null {
  if (target === 'auto') return null;
  return adapters[target] || null;
}

export function getAllDeploymentAdapters(): DeploymentAdapter[] {
  return Object.values(adapters);
}
