'use server'

export async function exportedEcho(value) {
  return {
    ok: true,
    kind: 'exported',
    value: `echo-${value}`,
  }
}
