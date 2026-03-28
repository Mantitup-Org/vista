export default function NestedAnalyticsLayout({ children, summary, details }) {
  return (
    <section id="nested-analytics-layout">
      <div id="nested-analytics-children">{children}</div>
      <div id="nested-analytics-summary">{summary}</div>
      <div id="nested-analytics-details">{details}</div>
    </section>
  )
}
