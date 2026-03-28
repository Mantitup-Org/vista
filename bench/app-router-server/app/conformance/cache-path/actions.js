'use server'

import { revalidatePath } from 'vista/server'
import { bumpValue, resetValue } from './state'

export async function refreshPathCache() {
  bumpValue()
  revalidatePath('/conformance/cache-path')

  return {
    ok: true,
    kind: 'cache-path-refresh',
  }
}

export async function resetPathCache() {
  resetValue()
  revalidatePath('/conformance/cache-path')

  return {
    ok: true,
    kind: 'cache-path-reset',
  }
}
