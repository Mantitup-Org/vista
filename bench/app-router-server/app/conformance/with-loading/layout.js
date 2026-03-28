export default function WithLoadingLayout({ children, slot }) {
  return (
    <section id="with-loading-layout">
      <div id="with-loading-slot">{slot}</div>
      <div id="with-loading-children">{children}</div>
    </section>
  )
}
