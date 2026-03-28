import { notFound } from 'vista/server'

export const dynamic = 'force-dynamic'

export function generateMetadata() {
  notFound()
}

export default function SlotBoundaryPageError() {
  return <main id="slot-boundary-page-error">slot-boundary-page-error</main>
}
