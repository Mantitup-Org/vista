import type { MemoryStore, Message } from './types';
export declare class InMemoryHistory implements MemoryStore {
    private defaultSession;
    /** Maximum messages per session. Older messages are evicted when exceeded.
     * Set to Infinity to disable the limit. */
    private maxMessages;
    private sessions;
    constructor(defaultSession?: string, 
    /** Maximum messages per session. Older messages are evicted when exceeded.
     * Set to Infinity to disable the limit. */
    maxMessages?: number);
    getMessages(sessionId?: string): Message[];
    addMessage(message: Message, sessionId?: string): void;
    clear(sessionId?: string): void;
}
export declare function createMemory(defaultSession?: string, maxMessages?: number): MemoryStore;
