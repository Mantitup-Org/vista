"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryAgentStore = void 0;
exports.createMemory = createMemory;
class InMemoryAgentStore {
    sessions = new Map();
    get(sessionId) {
        return [...(this.sessions.get(sessionId) || [])];
    }
    set(sessionId, messages) {
        this.sessions.set(sessionId, [...messages]);
    }
    append(sessionId, messages) {
        const current = this.sessions.get(sessionId) || [];
        this.sessions.set(sessionId, [...current, ...messages]);
    }
    clear(sessionId) {
        if (sessionId) {
            this.sessions.delete(sessionId);
            return;
        }
        this.sessions.clear();
    }
}
exports.InMemoryAgentStore = InMemoryAgentStore;
function createMemory(store) {
    return store || new InMemoryAgentStore();
}
