export async function GET() {
  return Response.json({
    message: 'Hello from Vista.js',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return Response.json({ received: body });
}
