export async function GET(request: Request) {
  return Response.json({ message: 'Hello from Vista Route Handlers!' });
}

export async function POST(request: Request) {
  const data = await request.json().catch(() => ({}));
  return Response.json(
    {
      message: 'Data received',
      data,
    },
    { status: 201 }
  );
}
