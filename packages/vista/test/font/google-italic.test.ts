import { describe, expect, it, beforeEach } from 'vitest'

import { Inter } from '../../src/font/google'
import { clearRegistry, getFontLinkHTML } from '../../src/font/registry'

describe('vista/font/google italic-only styles (issue #204)', () => {
  beforeEach(() => clearRegistry())

  it('keeps the ital axis when only italic is requested', () => {
    Inter({ style: 'italic', weight: ['400', '700'] })
    const html = getFontLinkHTML()
    expect(html).toContain('ital%2Cwght%401%2C400%3B1%2C700')
  })

  it('still emits the plain wght axis for normal-only requests', () => {
    Inter({ weight: ['400', '700'] })
    const html = getFontLinkHTML()
    expect(html).toContain('wght%40400%3B700')
  })

  it('emits both tuple sets when normal and italic are requested', () => {
    Inter({ style: ['normal', 'italic'], weight: ['400'] })
    const html = getFontLinkHTML()
    expect(html).toContain('ital%2Cwght%400%2C400%3B1%2C400')
  })
})
