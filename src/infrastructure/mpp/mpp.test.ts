import { describe, expect, it, vi } from 'vitest'
import { MppCodec } from './MppCodec'
import { HttpMppToXmlConverter } from './HttpMppToXmlConverter'
import type { IdGenerator } from '../../application/ports/IdGenerator'
import type { MppToXmlConverter } from '../../application/ports/MppToXmlConverter'
import { createDemoProject } from '../../application/services/ProjectFactory'
import { refreshProject } from '../../application/services/ProjectRefresh'
import { FileUseCases } from '../../application/use-cases/FileUseCases'
import { MspdiCodec } from '../mspdi/MspdiCodec'
import type { ProjectRepository } from '../../application/ports/ProjectRepository'
import type { Project } from '../../domain/entities/Project'

class SeqIds implements IdGenerator {
  private n = 0
  private next(prefix: string) {
    this.n += 1
    return `${prefix}${this.n}`
  }
  projectId() {
    return this.next('p')
  }
  taskId() {
    return this.next('t')
  }
  resourceId() {
    return this.next('r')
  }
  dependencyId() {
    return this.next('d')
  }
  assignmentId() {
    return this.next('a')
  }
  calendarId() {
    return this.next('c')
  }
}

class MemoryRepo implements ProjectRepository {
  draft: Project | null = null
  async saveDraft(project: Project) {
    this.draft = project
  }
  async loadDraft() {
    return this.draft
  }
  async clearDraft() {
    this.draft = null
  }
}

describe('MppCodec', () => {
  it('handles .mpp and converts via port then MSPDI', async () => {
    const ids = new SeqIds()
    const sample = refreshProject(createDemoProject(ids))
    const xml = (await new MspdiCodec(ids).serialize(sample)).content

    const converter: MppToXmlConverter = {
      convert: vi.fn(async () => xml),
    }
    const sourceMpp = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3])
    const writtenMpp = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 9, 9, 9])
    const writer = { convert: vi.fn(async () => writtenMpp) }
    const codec = new MppCodec(ids, converter, writer)
    expect(codec.canHandle('plan.mpp')).toBe(true)
    expect(codec.canHandle('plan.mpt')).toBe(true)
    expect(codec.canHandle('plan.xml')).toBe(false)

    const parsed = await codec.parse(sourceMpp.buffer, 'website.mpp')
    expect(converter.convert).toHaveBeenCalled()
    expect(parsed.tasks.length).toBe(sample.tasks.length)
    expect(parsed.fileName).toBe('website.mpp')

    // Untouched plan → exact source bytes (identity save)
    const identity = await codec.serialize(parsed)
    expect(identity.extension).toBe('.mpp')
    expect(identity.content).toBeInstanceOf(Uint8Array)
    expect((identity.content as Uint8Array)[0]).toBe(0xd0)
    expect(writer.convert).not.toHaveBeenCalled()

    // Dirty plan → OLE writer path
    const saved = await codec.serialize(parsed.markDirty())
    expect(saved.extension).toBe('.mpp')
    expect(saved.content).toBeInstanceOf(Uint8Array)
    expect((saved.content as Uint8Array)[0]).toBe(0xd0)
    expect(writer.convert).toHaveBeenCalled()
  })
})

describe('HttpMppToXmlConverter', () => {
  it('posts multipart and returns XML text', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('<Project></Project>', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const converter = new HttpMppToXmlConverter('/api/mpp/to-xml')
    const xml = await converter.convert(new Uint8Array([1, 2, 3]).buffer, 'a.mpp')
    expect(xml).toContain('<Project')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/mpp/to-xml',
      expect.objectContaining({ method: 'POST' }),
    )
    vi.unstubAllGlobals()
  })

  it('surfaces API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'bad mpp' }), { status: 500 }),
      ),
    )
    const converter = new HttpMppToXmlConverter()
    await expect(
      converter.convert(new ArrayBuffer(1), 'bad.mpp'),
    ).rejects.toThrow(/bad mpp/)
    vi.unstubAllGlobals()
  })
})

describe('FileUseCases with MPP', () => {
  it('opens mpp through codec chain and saves as xml', async () => {
    const ids = new SeqIds()
    const sample = refreshProject(createDemoProject(ids))
    const xml = (await new MspdiCodec(ids).serialize(sample)).content
    const converter: MppToXmlConverter = {
      convert: async () => xml,
    }
    const files = new FileUseCases(
      [new MppCodec(ids, converter), new MspdiCodec(ids)],
      new MemoryRepo(),
    )
    const opened = await files.openFile(new ArrayBuffer(4), 'demo.mpp')
    expect(opened.fileName).toBe('demo.mpp')
    const saved = await files.saveFile(opened)
    expect(saved.fileName).toBe('demo.xml')
  })
})
