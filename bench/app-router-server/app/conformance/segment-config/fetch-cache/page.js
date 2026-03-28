export const dynamic = 'force-dynamic'
export const fetchCache = 'only-cache'

async function readCounter(bucket) {
  const baseUrl = process.env.VISTA_SEGMENT_FETCH_BASE_URL || 'http://127.0.0.1:5999'
  const response = await fetch(`${baseUrl}/segment-fetch?bucket=${bucket}`)
  return response.json()
}

export default async function SegmentFetchCachePage() {
  const payload = await readCounter('fetch-cache')

  return <p id="segment-fetch-cache">fetch-cache:{payload.value}</p>
}
