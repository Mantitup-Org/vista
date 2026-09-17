export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return Response.json({
    userId: id,
    status: 'active',
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const updates = await request.json();
  return Response.json({
    userId: id,
    updated: true,
    data: updates,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return Response.json({
    userId: id,
    deleted: true,
  });
}
