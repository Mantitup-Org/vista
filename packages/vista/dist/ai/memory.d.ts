import type { AgentMemory, AgentMessage } from './types';
export declare class InMemoryAgentStore implements AgentMemory {
    private sessions;
    get(sessionId: string): AgentMessage[];
    set(sessionId: string, messages: AgentMessage[]): void;
    append(sessionId: string, messages: AgentMessage[]): void;
    clear(sessionId?: string): void;
}
export declare function createMemory(store?: AgentMemory): AgentMemory;
