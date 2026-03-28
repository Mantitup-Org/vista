export default function SlotBoundaryLayout({ children, modal }) {
  return (
    <section id="slot-boundary-layout">
      <div id="slot-boundary-children">{children}</div>
      <aside id="slot-boundary-modal">{modal}</aside>
    </section>
  )
}
