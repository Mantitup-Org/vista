'use server'

import { revalidateTag } from 'vista/server'
import { bumpValue, resetValue } from './state'

export async function refreshUseCache() {
  bumpValue()
  revalidateTag('conformance-use-cache')

  return {
    ok: true,
    kind: 'use-cache-refresh',
  }
}

export async function resetUseCache() {
  resetValue()
  revalidateTag('conformance-use-cache')

  return {
    ok: true,
    kind: 'use-cache-reset',
  }
}
