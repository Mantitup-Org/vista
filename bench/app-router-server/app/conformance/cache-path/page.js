import ActionProbe from '../action-probe'
import { readValue } from './state'
import { refreshPathCache, resetPathCache } from './actions'

export default function CachePathPage() {
  return (
    <main>
      <h2>Cache Path</h2>
      <p id="cache-path-value">cache-path:{readValue()}</p>
      <ActionProbe label="cache-path-refresh" action={refreshPathCache} />
      <ActionProbe label="cache-path-reset" action={resetPathCache} />
    </main>
  )
}
