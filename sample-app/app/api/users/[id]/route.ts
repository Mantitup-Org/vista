export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await context.params;
  return Response.json({
    userId: id,
    name: `User ${id}`,
    role: 'Member',
  });
}
