// Server-only module reached exclusively through a route handler. The conformance
// suite asserts this marker never appears in any client asset.
export const ROUTE_SERVER_ONLY_MARKER = 'vista-route-handler-server-only-marker'

export function describeMethod(method) {
  return { ok: true, from: 'conformance-api-methods', method }
}
