'use client'

export default function Error({ error, reset }) {
  return (
    <div>
      <h2>Conformance Error Boundary</h2>
      <p>{error?.message || 'Unknown error'}</p>
      <button onClick={() => reset()}>Retry</button>
    </div>
  )
}
