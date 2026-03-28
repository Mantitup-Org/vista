export const dynamic = 'force-dynamic'
export const fetchCache = 'only-no-store'

async function readCounter(bucket) {
  const baseUrl = process.env.VISTA_SEGMENT_FETCH_BASE_URL || 'http://127.0.0.1:5999'
  const response = await fetch(`${baseUrl}/segment-fetch?bucket=${bucket}`)
  return response.json()
}

export default async function SegmentFetchNoStorePage() {
  const payload = await readCounter('fetch-no-store')

  return <p id="segment-fetch-no-store">fetch-no-store:{payload.value}</p>
}
