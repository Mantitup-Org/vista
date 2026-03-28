'use client'

export default function ActionProbe({ label, action }) {
  return (
    <p data-action-probe={label}>
      {label}:{typeof action === 'function' ? 'action-ready' : 'action-missing'}
    </p>
  )
}
