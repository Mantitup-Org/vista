export default function NestedSlotsLayout({ children, analytics }) {
  return (
    <section id="nested-slots-layout">
      <div id="nested-slots-children">{children}</div>
      <aside id="nested-slots-analytics">{analytics}</aside>
    </section>
  )
}
