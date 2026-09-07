export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return Response.json({ id: params.id });
}

export async function PUT() {
  return Response.json({ method: 'PUT' });
}

export async function PATCH() {
  return Response.json({ method: 'PATCH' });
}

export async function DELETE() {
  return Response.json({ method: 'DELETE' });
}
