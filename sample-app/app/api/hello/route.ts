import { NextResponse } from 'vista/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name') || 'World';

  return NextResponse.json({
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json({
      received: body,
      echoed: true,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}
