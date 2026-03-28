import * as React from 'react'

if (!('hot' in Math)) Math.hot = false

export const dynamic = 'force-dynamic'

export default function page() {
  const previous = Math.hot
  Math.hot = true

  // crash the server after responding
  if (process.env.CRASH_FUNCTION) {
    setTimeout(() => {
      throw new Error('crash')
    }, 500)
  }

  return <div>{previous ? 'HOT' : 'COLD'}</div>
}
