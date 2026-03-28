'use server'

import { revalidateTag } from 'vista/server'
import { bumpValue, resetValue } from './state'

export async function refreshTagCache() {
  bumpValue()
  revalidateTag('conformance-cache-tag')

  return {
    ok: true,
    kind: 'cache-tag-refresh',
  }
}

export async function resetTagCache() {
  resetValue()
  revalidateTag('conformance-cache-tag')

  return {
    ok: true,
    kind: 'cache-tag-reset',
  }
}
