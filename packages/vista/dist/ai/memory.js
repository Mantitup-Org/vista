"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryHistory = void 0;
exports.createMemory = createMemory;
class InMemoryHistory {
    defaultSession;
    sessions = new Map();
    constructor(defaultSession = 'default') {
        this.defaultSession = defaultSession;
    }
    getMessages(sessionId = this.defaultSession) {
        const list = this.sessions.get(sessionId) || [];
        return [...list];
    }
    addMessage(message, sessionId = this.defaultSession) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, []);
        }
        this.sessions.get(sessionId).push({ ...message });
    }
    clear(sessionId = this.defaultSession) {
        this.sessions.delete(sessionId);
    }
}
exports.InMemoryHistory = InMemoryHistory;
function createMemory(defaultSession) {
    return new InMemoryHistory(defaultSession);
}
