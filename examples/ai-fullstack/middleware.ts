import type { MiddlewareContext } from 'vista/server';

export async function middleware({ request, next }: MiddlewareContext) {
  const url = new URL(request.url);

  // Authentication check for protected endpoints
  if (url.pathname.startsWith('/api/protected')) {
    const auth = request.headers.get('Authorization');
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Inject request telemetry downstream
  return next({
    headers: {
      'x-request-id': crypto.randomUUID(),
      'x-framework': 'vista-ai-native',
    },
  });
}

export const config = {
  matcher: ['/api/:path*'],
};
