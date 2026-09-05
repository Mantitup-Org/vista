export async function middleware({ request, next }: { request: Request & { nextUrl?: { pathname: string } }; next: () => Promise<Response> }) {
  const pathname = (request as any).nextUrl?.pathname || new URL(request.url).pathname;
  if (pathname === '/admin') {
    return new Response('unauthorized', { status: 401 });
  }

  const response = await next();
  response.headers.set('x-vista-example', 'middleware');
  return response;
}
