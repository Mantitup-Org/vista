export default function InterceptionConformanceLayout({ children, modal }) {
  return (
    <section>
      <div id="interception-children">{children}</div>
      <aside id="interception-slot">{modal ?? <p>interception-slot-missing</p>}</aside>
    </section>
  )
}
