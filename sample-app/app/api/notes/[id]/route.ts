// GET    /api/notes/:id
// PATCH  /api/notes/:id
// DELETE /api/notes/:id
//
// `[id]` makes the segment dynamic. Its value arrives on `context.params`.

import { deleteNote, getNote, updateNote } from '../notes-store';

type RouteContext = { params: { id: string } };

export async function GET(request: Request, { params }: RouteContext) {
  const note = getNote(params.id);
  if (!note) {
    return Response.json({ error: 'Note not found' }, { status: 404 });
  }

  return Response.json({ note });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const payload = await request.json().catch(() => ({}));
  const note = updateNote(params.id, payload);
  if (!note) {
    return Response.json({ error: 'Note not found' }, { status: 404 });
  }

  return Response.json({ note });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!deleteNote(params.id)) {
    return Response.json({ error: 'Note not found' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
