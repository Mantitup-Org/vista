import ActionProbe from '../action-probe'
import { getCachedValue } from './data'
import { refreshTagCache, resetTagCache } from './actions'

export const dynamic = 'force-dynamic'

export default async function CacheTagPage() {
  const payload = await getCachedValue()

  return (
    <main>
      <h2>Cache Tag</h2>
      <p id="cache-tag-value">cache-tag:{payload.value}</p>
      <ActionProbe label="cache-tag-refresh" action={refreshTagCache} />
      <ActionProbe label="cache-tag-reset" action={resetTagCache} />
    </main>
  )
}
