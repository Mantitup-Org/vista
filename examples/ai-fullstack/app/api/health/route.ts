export async function GET() {
  return Response.json({
    status: 'healthy',
    framework: 'vista.js',
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return Response.json({
    status: 'echo',
    received: body,
    timestamp: new Date().toISOString(),
  });
}
