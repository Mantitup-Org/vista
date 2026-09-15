import type { MemoryStore, Message } from './types';
export declare class InMemoryHistory implements MemoryStore {
    private defaultSession;
    private sessions;
    constructor(defaultSession?: string);
    getMessages(sessionId?: string): Message[];
    addMessage(message: Message, sessionId?: string): void;
    clear(sessionId?: string): void;
}
export declare function createMemory(defaultSession?: string): MemoryStore;
