const counters = new Map()

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const bucket = searchParams.get('bucket') || 'default'
  const nextValue = (counters.get(bucket) || 0) + 1
  counters.set(bucket, nextValue)

  return Response.json({
    bucket,
    value: nextValue,
  })
}
