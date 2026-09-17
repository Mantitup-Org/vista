/**
 * Server-only in-memory store backing the example API routes.
 *
 * Nothing here is imported by a component, so it never enters the client bundle -
 * this is where a real app would talk to its database instead.
 */

export interface Note {
  id: string;
  title: string;
  body: string;
}

const notes = new Map<string, Note>([
  ['1', { id: '1', title: 'First note', body: 'API routes live in app/api/**/route.ts' }],
  ['2', { id: '2', title: 'Second note', body: 'Each file exports one function per method' }],
]);

let nextId = 3;

export function listNotes(): Note[] {
  return [...notes.values()];
}

export function getNote(id: string): Note | undefined {
  return notes.get(id);
}

export function createNote(input: { title?: unknown; body?: unknown }): Note {
  const note: Note = {
    id: String(nextId++),
    title: typeof input.title === 'string' ? input.title : 'Untitled',
    body: typeof input.body === 'string' ? input.body : '',
  };
  notes.set(note.id, note);
  return note;
}

export function updateNote(id: string, input: { title?: unknown; body?: unknown }): Note | null {
  const existing = notes.get(id);
  if (!existing) return null;

  const updated: Note = {
    ...existing,
    ...(typeof input.title === 'string' ? { title: input.title } : {}),
    ...(typeof input.body === 'string' ? { body: input.body } : {}),
  };
  notes.set(id, updated);
  return updated;
}

export function deleteNote(id: string): boolean {
  return notes.delete(id);
}
