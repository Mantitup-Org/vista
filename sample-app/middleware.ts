import type { MiddlewareContext } from 'vista/server';

export async function middleware({ request, next }: MiddlewareContext) {
  const url = new URL(request.url);

  // Example route protection for sensitive routes
  if (url.pathname.startsWith('/api/admin')) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return Response.json(
        { error: 'Unauthorized: Admin access requires Bearer token' },
        { status: 401 }
      );
    }
  }

  // Pass request downstream with custom telemetry/request headers
  return next({
    headers: {
      'x-vista-middleware': 'active',
      'x-request-timestamp': new Date().toISOString(),
    },
  });
}

export const config = {
  // Global or route-specific matcher patterns
  matcher: ['/api/:path*', '/dashboard/:path*'],
};
