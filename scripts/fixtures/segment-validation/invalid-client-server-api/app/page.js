'use client'

import { cookies } from 'vista/server'

export default function InvalidClientServerApiPage() {
  return <p>{String(Boolean(cookies))}</p>
}
