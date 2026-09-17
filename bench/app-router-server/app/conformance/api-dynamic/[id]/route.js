export async function GET(request, context) {
  return Response.json({
    ok: true,
    from: 'conformance-api-dynamic',
    id: context.params.id,
  })
}

export async function DELETE(request, context) {
  return Response.json({ ok: true, deleted: context.params.id })
}
