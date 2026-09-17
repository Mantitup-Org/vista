"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryHistory = void 0;
exports.createMemory = createMemory;
/** Default maximum number of messages retained per session.
 * Prevents unbounded growth in long-lived processes.
 * System messages are always preserved when trimming. */
const DEFAULT_MAX_MESSAGES = 100;
class InMemoryHistory {
    defaultSession;
    maxMessages;
    sessions = new Map();
    constructor(defaultSession = 'default', 
    /** Maximum messages per session. Older messages are evicted when exceeded.
     * Set to Infinity to disable the limit. */
    maxMessages = DEFAULT_MAX_MESSAGES) {
        this.defaultSession = defaultSession;
        this.maxMessages = maxMessages;
    }
    getMessages(sessionId = this.defaultSession) {
        const list = this.sessions.get(sessionId) || [];
        return [...list];
    }
    addMessage(message, sessionId = this.defaultSession) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, []);
        }
        const msgs = this.sessions.get(sessionId);
        msgs.push({ ...message });
        // Trim to maxMessages — preserve system messages at index 0 if present
        if (msgs.length > this.maxMessages) {
            const systemMsg = msgs[0]?.role === 'system' ? msgs[0] : null;
            const excess = msgs.length - this.maxMessages;
            // Remove oldest non-system messages
            msgs.splice(systemMsg ? 1 : 0, excess);
        }
    }
    clear(sessionId = this.defaultSession) {
        this.sessions.delete(sessionId);
    }
}
exports.InMemoryHistory = InMemoryHistory;
function createMemory(defaultSession, maxMessages) {
    return new InMemoryHistory(defaultSession, maxMessages);
}
