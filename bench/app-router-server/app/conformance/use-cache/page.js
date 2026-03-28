'use cache'

import ActionProbe from '../action-probe'
import { cacheLife, cacheTag } from 'vista/server'
import { refreshUseCache, resetUseCache } from './actions'
import { readValue } from './state'

export const dynamic = 'force-dynamic'

export default function UseCachePage() {
  cacheLife(60)
  cacheTag('conformance-use-cache')

  return (
    <main>
      <h2>Use Cache</h2>
      <p id="use-cache-value">use-cache:{readValue()}</p>
      <ActionProbe label="use-cache-refresh" action={refreshUseCache} />
      <ActionProbe label="use-cache-reset" action={resetUseCache} />
    </main>
  )
}
