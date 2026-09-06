import type { AgentObservation } from './types';
export declare function onAgentObservation(listener: (observation: AgentObservation) => void): () => void;
export declare function emitAgentObservation(observation: AgentObservation): void;
export declare function estimateCostUsd(model: string, usage: {
    inputTokens: number;
    outputTokens: number;
}): number | undefined;
