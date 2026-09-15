import type { MemoryStore, Message } from './types';

export class InMemoryHistory implements MemoryStore {
  private sessions = new Map<string, Message[]>();

  constructor(private defaultSession = 'default') {}

  getMessages(sessionId = this.defaultSession): Message[] {
    const list = this.sessions.get(sessionId) || [];
    return [...list];
  }

  addMessage(message: Message, sessionId = this.defaultSession): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, []);
    }
    this.sessions.get(sessionId)!.push({ ...message });
  }

  clear(sessionId = this.defaultSession): void {
    this.sessions.delete(sessionId);
  }
}

export function createMemory(defaultSession?: string): MemoryStore {
  return new InMemoryHistory(defaultSession);
}
