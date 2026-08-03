import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { saveBlobToDisk } from './saveBlob'

describe('saveBlobToDisk', () => {
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('falls back to <a download> when no picker/Tauri', async () => {
    const name = await saveBlobToDisk(new Blob(['hi']), 'plan.xml')
    expect(name).toBe('plan.xml')
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('uses showSaveFilePicker when available', async () => {
    const write = vi.fn()
    const close = vi.fn()
    ;(window as { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn(async () => ({
      name: 'picked.pdf',
      createWritable: async () => ({ write, close }),
    }))
    const name = await saveBlobToDisk(new Blob(['pdf']), 'out.pdf')
    expect(name).toBe('picked.pdf')
    expect(write).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  it('returns null when the picker is aborted', async () => {
    ;(window as { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(saveBlobToDisk(new Blob(['x']), 'a.mpx')).resolves.toBeNull()
  })

  it('uses Tauri invoke when internals are present', async () => {
    ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(async () => '/tmp/saved.mpp'),
    }))
    // Re-import after mock is fragile; stub via dynamic path used by module:
    const core = await import('@tauri-apps/api/core')
    vi.spyOn(core, 'invoke').mockResolvedValue('/tmp/saved.mpp')
    const name = await saveBlobToDisk(new Blob(['mpp']), 'p.mpp')
    expect(name).toBe('/tmp/saved.mpp')
  })
})
