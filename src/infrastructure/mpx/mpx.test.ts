import { describe, expect, it } from 'vitest'
import {
  MpxCodec,
  explainMppWriteUnsupported,
  projectLibreCanWriteMpp,
  projectLibreWriteFormats,
} from './MpxCodec'
import { createDemoProject } from '../../application/services/ProjectFactory'
import { refreshProject } from '../../application/services/ProjectRefresh'
import { FileUseCases } from '../../application/use-cases/FileUseCases'
import { MspdiCodec } from '../mspdi/MspdiCodec'
import type { IdGenerator } from '../../application/ports/IdGenerator'
import { MemoryRepo } from '../../test/memoryRepo'

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

describe('ProjectLibre write formats', () => {
  it('documents ProjectLibre cannot write MPP (SuperGantt writes OLE MPP itself)', () => {
    expect(projectLibreCanWriteMpp()).toBe(false)
    expect(projectLibreWriteFormats()).toEqual(['MPX', 'XML', 'PLANNER', 'JSON'])
    expect(explainMppWriteUnsupported()).toMatch(/MSPDI/)
  })

  it('writes MPX like ProjectLibre MPXWriter path', async () => {
    const ids = new SeqIds()
    const project = refreshProject(createDemoProject(ids))
    const codec = new MpxCodec()
    expect(codec.canHandle('plan.mpx')).toBe(true)
    const { content, extension } = await codec.serialize(project)
    expect(extension).toBe('.mpx')
    expect(content.startsWith('MPX,')).toBe(true)
    expect(content).toContain('Kickoff meeting')
  })

  it('saves XML and MPX via FileUseCases', async () => {
    const ids = new SeqIds()
    const files = new FileUseCases(
      [new MspdiCodec(ids), new MpxCodec()],
      new MemoryRepo(),
    )
    const project = refreshProject(createDemoProject(ids))
    const xml = await files.saveFile(project, undefined, 'mspdi')
    expect(xml.fileName.endsWith('.xml')).toBe(true)
    const mpx = await files.saveFile(project, undefined, 'mpx')
    expect(mpx.fileName.endsWith('.mpx')).toBe(true)
  })
})
