// GET  /api/notes  - list notes
// POST /api/notes  - create a note
//
// A file named `route.ts` turns its directory into an API endpoint. Export one
// function per HTTP method; anything not exported answers 405.

import { createNote, listNotes } from './notes-store';

export async function GET() {
  return Response.json({ notes: listNotes() });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const note = createNote(payload);

  return Response.json({ note }, { status: 201 });
}
