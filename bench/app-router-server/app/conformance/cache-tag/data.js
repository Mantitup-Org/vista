import { unstable_cache } from 'vista/server'
import { readValue } from './state'

export const getCachedValue = unstable_cache(
  async () => {
    return {
      value: readValue(),
    }
  },
  ['conformance-cache-tag'],
  {
    tags: ['conformance-cache-tag'],
  }
)
