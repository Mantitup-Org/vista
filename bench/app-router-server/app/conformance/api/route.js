export async function GET() {
  return new Response(JSON.stringify({ ok: true, from: 'conformance-route' }), {
    headers: {
      'content-type': 'application/json',
    },
  })
}
