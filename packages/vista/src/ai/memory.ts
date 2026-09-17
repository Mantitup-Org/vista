import type { AgentMemory, Message } from './types';

export interface InMemoryStoreOptions {
  maxMessages?: number;
  ttlMs?: number;
}

export class InMemoryStore implements AgentMemory {
  private sessions = new Map<string, { messages: Message[]; expiresAt: number }>();
  private maxMessages: number;
  private ttlMs?: number;

  constructor(options: InMemoryStoreOptions = {}) {
    this.maxMessages = options.maxMessages || 100;
    this.ttlMs = options.ttlMs;
  }

  async get(sessionId: string): Promise<Message[]> {
    this.cleanExpired();
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return [...session.messages];
  }

  async save(sessionId: string, messages: Message[]): Promise<void> {
    const trimmed = messages.slice(-this.maxMessages);
    const expiresAt = this.ttlMs ? Date.now() + this.ttlMs : Infinity;
    this.sessions.set(sessionId, { messages: trimmed, expiresAt });
  }

  async clear(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  private cleanExpired(): void {
    if (!this.ttlMs) return;
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }
  }
}

export const defaultMemoryStore = new InMemoryStore();
