import { describe, expect, it, afterEach, vi } from 'vitest'
import { planFileInputAccept } from './planFileInputAccept'

describe('planFileInputAccept', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses */* on Android so WebView does not grey out .mpp', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S938B)' })
    expect(planFileInputAccept()).toBe('*/*')
  })

  it('keeps extension+MIME filters on desktop browsers', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    })
    const accept = planFileInputAccept()
    expect(accept).toContain('.mpp')
    expect(accept).toContain('application/vnd.ms-project')
    expect(accept).not.toBe('*/*')
  })
})
