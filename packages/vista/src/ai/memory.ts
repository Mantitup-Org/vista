import type { AgentMemory, AgentMessage } from './types';

export class InMemoryAgentStore implements AgentMemory {
  private sessions = new Map<string, AgentMessage[]>();

  get(sessionId: string): AgentMessage[] {
    return [...(this.sessions.get(sessionId) || [])];
  }

  set(sessionId: string, messages: AgentMessage[]): void {
    this.sessions.set(sessionId, [...messages]);
  }

  append(sessionId: string, messages: AgentMessage[]): void {
    const current = this.sessions.get(sessionId) || [];
    this.sessions.set(sessionId, [...current, ...messages]);
  }

  clear(sessionId?: string): void {
    if (sessionId) {
      this.sessions.delete(sessionId);
      return;
    }
    this.sessions.clear();
  }
}

export function createMemory(store?: AgentMemory): AgentMemory {
  return store || new InMemoryAgentStore();
}
