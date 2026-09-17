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
  const data = await request.json().catch(() => ({}));
  return Response.json({
    userId: id,
    action: 'updated',
    data,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return Response.json({
    userId: id,
    action: 'deleted',
  });
}
