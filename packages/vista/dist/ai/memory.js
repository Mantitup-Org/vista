"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultMemoryStore = exports.InMemoryStore = void 0;
class InMemoryStore {
    sessions = new Map();
    maxMessages;
    ttlMs;
    constructor(options = {}) {
        this.maxMessages = options.maxMessages || 100;
        this.ttlMs = options.ttlMs;
    }
    async get(sessionId) {
        this.cleanExpired();
        const session = this.sessions.get(sessionId);
        if (!session)
            return [];
        return [...session.messages];
    }
    async save(sessionId, messages) {
        const trimmed = messages.slice(-this.maxMessages);
        const expiresAt = this.ttlMs ? Date.now() + this.ttlMs : Infinity;
        this.sessions.set(sessionId, { messages: trimmed, expiresAt });
    }
    async clear(sessionId) {
        this.sessions.delete(sessionId);
    }
    cleanExpired() {
        if (!this.ttlMs)
            return;
        const now = Date.now();
        for (const [id, session] of this.sessions.entries()) {
            if (session.expiresAt <= now) {
                this.sessions.delete(id);
            }
        }
    }
}
exports.InMemoryStore = InMemoryStore;
exports.defaultMemoryStore = new InMemoryStore();
