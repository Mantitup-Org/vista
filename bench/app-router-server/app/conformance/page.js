import ClientCounter from './client-counter'
import { createMessage } from './actions'

export const dynamic = 'force-dynamic'

export default async function Page() {
  return (
    <main>
      <p>RSC conformance fixture</p>
      <ClientCounter />
      <form action={createMessage}>
        <input name="name" defaultValue="vista" />
        <button type="submit">Run Server Action</button>
      </form>
    </main>
  )
}
