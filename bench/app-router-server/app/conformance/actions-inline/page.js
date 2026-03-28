import ActionProbe from '../action-probe'

export const dynamic = 'force-dynamic'

export default function InlineActionsPage() {
  async function inlineEcho(value) {
    'use server'

    return {
      ok: true,
      kind: 'inline',
      value: `echo-${value}`,
    }
  }

  return (
    <main>
      <h2>Inline Actions</h2>
      <p id="inline-actions-status">inline-actions-ready</p>
      <ActionProbe label="inline" action={inlineEcho} />
    </main>
  )
}
