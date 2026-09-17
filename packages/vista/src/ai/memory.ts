import type { MemoryStore, Message } from './types';

/** Default maximum number of messages retained per session.
 * Prevents unbounded growth in long-lived processes.
 * System messages are always preserved when trimming. */
const DEFAULT_MAX_MESSAGES = 100;

export class InMemoryHistory implements MemoryStore {
  private sessions = new Map<string, Message[]>();

  constructor(
    private defaultSession = 'default',
    /** Maximum messages per session. Older messages are evicted when exceeded.
     * Set to Infinity to disable the limit. */
    private maxMessages = DEFAULT_MAX_MESSAGES
  ) {}

  getMessages(sessionId = this.defaultSession): Message[] {
    const list = this.sessions.get(sessionId) || [];
    return [...list];
  }

  addMessage(message: Message, sessionId = this.defaultSession): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, []);
    }
    const msgs = this.sessions.get(sessionId)!;
    msgs.push({ ...message });

    // Trim to maxMessages — preserve system messages at index 0 if present
    if (msgs.length > this.maxMessages) {
      const systemMsg = msgs[0]?.role === 'system' ? msgs[0] : null;
      const excess = msgs.length - this.maxMessages;
      // Remove oldest non-system messages
      msgs.splice(systemMsg ? 1 : 0, excess);
    }
  }

  clear(sessionId = this.defaultSession): void {
    this.sessions.delete(sessionId);
  }
}

export function createMemory(defaultSession?: string, maxMessages?: number): MemoryStore {
  return new InMemoryHistory(defaultSession, maxMessages);
}
