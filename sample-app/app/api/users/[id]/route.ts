import { NextResponse } from 'vista/server';

interface UserContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function GET(_request: Request, context: UserContext) {
  const params = await context.params;
  const { id } = params;

  return NextResponse.json({
    id,
    name: `User ${id}`,
    role: 'developer',
  });
}

export async function DELETE(_request: Request, context: UserContext) {
  const params = await context.params;
  const { id } = params;

  return NextResponse.json({
    success: true,
    deletedId: id,
  });
}
