import type express from 'express';
import { Agent } from './agent';
export type DiscoveredAgent = {
    name: string;
    filePath: string;
    agent: Agent;
};
export declare function discoverAgents(cwd: string): DiscoveredAgent[];
export declare function tryHandleAgentRequest(req: express.Request, res: express.Response, cwd: string, isDev: boolean): Promise<boolean>;
