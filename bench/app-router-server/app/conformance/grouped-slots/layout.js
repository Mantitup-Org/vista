export default function GroupedSlotsLayout({ children, panel }) {
  return (
    <section id="grouped-slots-layout">
      <div id="grouped-slots-children">{children}</div>
      <aside id="grouped-slots-panel">{panel}</aside>
    </section>
  )
}
