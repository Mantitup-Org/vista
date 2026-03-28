'use server'

export async function createMessage(formData) {
  const name = String(formData.get('name') || 'anon')
  return { ok: true, message: `hello-${name}` }
}
