import ActionProbe from '../action-probe'
import { exportedEcho } from './server-actions'

export const dynamic = 'force-dynamic'

export default function ExportedActionsPage() {
  return (
    <main>
      <h2>Exported Actions</h2>
      <p id="exported-actions-status">exported-actions-ready</p>
      <ActionProbe label="exported" action={exportedEcho} />
    </main>
  )
}
