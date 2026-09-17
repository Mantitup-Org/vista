import { ROUTE_SERVER_ONLY_MARKER, describeMethod } from './server-only'

async function readBody(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function GET() {
  return Response.json(describeMethod('GET'))
}

export async function POST(request) {
  return Response.json({ ...describeMethod('POST'), body: await readBody(request) })
}

export async function PUT(request) {
  return Response.json({ ...describeMethod('PUT'), body: await readBody(request) })
}

export async function PATCH(request) {
  return Response.json({ ...describeMethod('PATCH'), body: await readBody(request) })
}

export async function DELETE() {
  return Response.json({ ...describeMethod('DELETE'), marker: ROUTE_SERVER_ONLY_MARKER })
}
