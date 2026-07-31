import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { MppToXmlConverter } from '../../application/ports/MppToXmlConverter'
import { PreferTauriMppToXmlConverter } from './PreferTauriMppToXmlConverter'

const invoke = vi.fn()
const isTauri = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => isTauri(),
}))

describe('PreferTauriMppToXmlConverter', () => {
  beforeEach(() => {
    invoke.mockReset()
    isTauri.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses Tauri invoke when running inside Tauri', async () => {
    isTauri.mockReturnValue(true)
    invoke.mockResolvedValue('<Project/>')
    const fallback: MppToXmlConverter = { convert: vi.fn() }
    const c = new PreferTauriMppToXmlConverter(fallback)
    const xml = await c.convert(new Uint8Array([1, 2, 3]).buffer, 'a.mpp')
    expect(xml).toBe('<Project/>')
    expect(invoke).toHaveBeenCalledWith(
      'mpp_to_xml',
      expect.objectContaining({ fileName: 'a.mpp' }),
    )
  })

  it('falls back to HTTP converter outside Tauri', async () => {
    isTauri.mockReturnValue(false)
    const fallback: MppToXmlConverter = {
      convert: vi.fn().mockResolvedValue('<FromHttp/>'),
    }
    const c = new PreferTauriMppToXmlConverter(fallback)
    const xml = await c.convert(new ArrayBuffer(0), 'b.mpp')
    expect(xml).toBe('<FromHttp/>')
    expect(fallback.convert).toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })
})
