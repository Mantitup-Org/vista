export const runtime = 'nodejs'
export const preferredRegion = ['home', 'global']
export const maxDuration = 7

export default function SegmentConfigLayout({ children }) {
  return <section id="segment-config-layout">{children}</section>
}
