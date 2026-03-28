export const runtime = 'edge'

export async function GET(request) {
  return Response.json({
    ok: true,
    from: 'conformance-edge-route',
    runtime: 'edge',
    pathname: request.nextUrl.pathname,
  })
}
