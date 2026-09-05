export async function GET(request, context) {
  return Response.json({
    ok: true,
    from: 'conformance-api-catch-all',
    segments: context.params.segments,
  })
}
