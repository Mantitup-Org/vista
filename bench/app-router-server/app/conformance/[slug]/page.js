export async function generateMetadata({ params }) {
  return {
    title: `Conformance ${params.slug}`,
  }
}

export default function DynamicConformancePage({ params }) {
  return <p>Dynamic slug: {params.slug}</p>
}
