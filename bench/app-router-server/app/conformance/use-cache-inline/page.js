import ActionProbe from '../action-probe'
import { cacheLife, cacheTag } from 'vista/server'
import { refreshInlineUseCache, resetInlineUseCache } from './actions'
import { readValue } from './state'

export const dynamic = 'force-dynamic'

export default async function UseCacheInlinePage() {
  async function readInlineCachedValue() {
    'use cache'

    cacheLife(60)
    cacheTag('conformance-use-cache-inline')

    return {
      value: readValue(),
    }
  }

  const payload = await readInlineCachedValue()

  return (
    <main>
      <h2>Use Cache Inline</h2>
      <p id="use-cache-inline-value">use-cache-inline:{payload.value}</p>
      <ActionProbe label="use-cache-inline-refresh" action={refreshInlineUseCache} />
      <ActionProbe label="use-cache-inline-reset" action={resetInlineUseCache} />
    </main>
  )
}
