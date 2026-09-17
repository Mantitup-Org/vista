import type { AgentMemory, Message } from './types';
export interface InMemoryStoreOptions {
    maxMessages?: number;
    ttlMs?: number;
}
export declare class InMemoryStore implements AgentMemory {
    private sessions;
    private maxMessages;
    private ttlMs?;
    constructor(options?: InMemoryStoreOptions);
    get(sessionId: string): Promise<Message[]>;
    save(sessionId: string, messages: Message[]): Promise<void>;
    clear(sessionId: string): Promise<void>;
    private cleanExpired;
}
export declare const defaultMemoryStore: InMemoryStore;
