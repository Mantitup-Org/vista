export default async function WithLoadingFooPage() {
  await new Promise((resolve) => setTimeout(resolve, 25))

  return <p id="with-loading-foo">with-loading-foo</p>
}
