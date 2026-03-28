'use server'

import { revalidateTag } from 'vista/server'
import { bumpValue, resetValue } from './state'

export async function refreshInlineUseCache() {
  bumpValue()
  revalidateTag('conformance-use-cache-inline')

  return {
    ok: true,
    kind: 'use-cache-inline-refresh',
  }
}

export async function resetInlineUseCache() {
  resetValue()
  revalidateTag('conformance-use-cache-inline')

  return {
    ok: true,
    kind: 'use-cache-inline-reset',
  }
}
