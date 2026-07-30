import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { HttpXmlToMppConverter } from './HttpXmlToMppConverter'
import { HttpMppToXmlConverter } from './HttpMppToXmlConverter'
import { exportProjectPdf } from '../pdf/exportProjectPdf'
import { createDemoProject } from '../../application/services/ProjectFactory'
import { refreshProject } from '../../application/services/ProjectRefresh'
import { UuidIdGenerator } from '../ids/UuidIdGenerator'

describe('HttpXmlToMppConverter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts xml and returns bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => bytes.buffer,
      }),
    )
    const converter = new HttpXmlToMppConverter('/api/mpp/from-xml')
    const out = await converter.convert('<Project/>', 'plan')
    expect(out).toEqual(bytes)
    expect(fetch).toHaveBeenCalledWith(
      '/api/mpp/from-xml',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('surfaces json and plain errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'server says no' }),
      }),
    )
    await expect(new HttpXmlToMppConverter().convert('<x/>')).rejects.toThrow('server says no')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json')
        },
      }),
    )
    await expect(new HttpXmlToMppConverter().convert('<x/>', 'a.xml')).rejects.toThrow(
      /MPP write failed \(502\)/,
    )
  })
})

describe('HttpMppToXmlConverter error paths', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('surfaces conversion errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'bad mpp' }),
      }),
    )
    await expect(
      new HttpMppToXmlConverter().convert(new ArrayBuffer(4), 'x.mpp'),
    ).rejects.toThrow('bad mpp')
  })
})

describe('exportProjectPdf', () => {
  beforeEach(() => {
    // jsPDF uses some canvas APIs in jsdom — ensure blob output works
  })

  it('builds a PDF blob with a task table and a Gantt page', async () => {
    const project = refreshProject(createDemoProject(new UuidIdGenerator()))
    const blob = await exportProjectPdf(project)
    expect(blob).toBeInstanceOf(Blob)
    // Table + Gantt pages produce a noticeably larger PDF than an empty doc
    expect(blob.size).toBeGreaterThan(1500)
    expect(blob.type === '' || blob.type.includes('pdf')).toBe(true)
  })
})
