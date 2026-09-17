import type { ResolvedDeployTarget } from '../types';
import { cloudflareAdapter } from './cloudflare';
import { dockerAdapter } from './docker';
import { netlifyAdapter } from './netlify';
import { renderAdapter } from './render';
import { vercelAdapter } from './vercel';
export declare const deployAdapters: {
    readonly render: import("../types").DeployAdapter;
    readonly vercel: import("../types").DeployAdapter;
    readonly cloudflare: import("../types").DeployAdapter;
    readonly netlify: import("../types").DeployAdapter;
    readonly docker: import("../types").DeployAdapter;
};
export declare function getDeployAdapter(target: ResolvedDeployTarget): import("../types").DeployAdapter;
export { cloudflareAdapter, dockerAdapter, netlifyAdapter, renderAdapter, vercelAdapter };
