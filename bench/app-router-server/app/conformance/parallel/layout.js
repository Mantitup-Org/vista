export default function ParallelConformanceLayout({ children, inspector }) {
  return (
    <section>
      <div id="parallel-children">{children}</div>
      <aside id="parallel-slot">{inspector ?? <p>parallel-slot-missing</p>}</aside>
    </section>
  )
}
