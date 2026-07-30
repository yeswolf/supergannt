import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  convertMppBufferToXml,
  convertXmlToMppBuffer,
  getMppEngineStatus,
} from '../../../server/mppConvert.ts'
import { MspdiCodec } from '../mspdi/MspdiCodec'
import { MppCodec } from './MppCodec'
import { refreshProject } from '../../application/services/ProjectRefresh'
import type { IdGenerator } from '../../application/ports/IdGenerator'
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.resolve(__dirname, '../../../testdata/mpp')

function projectSnapshot(project: Project) {
  const tasks = project.tasks.map((t) => ({
    wbs: t.wbs,
    name: t.name,
    outlineLevel: t.outlineLevel,
    durationHours: Math.round(t.duration.toHours() * 100) / 100,
    milestone: t.milestone,
    summary: t.summary,
    percentComplete: t.percentComplete,
  }))
  const byWbs = new Map(project.tasks.map((t) => [t.id, t.wbs]))
  const dependencies = project.dependencies
    .map((d) => ({
      from: byWbs.get(d.predecessorId) ?? d.predecessorId,
      to: byWbs.get(d.successorId) ?? d.successorId,
      type: d.type,
      lagHours: Math.round(d.lag.toHours() * 100) / 100,
    }))
    .sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`))
  const resources = project.resources
    .map((r) => ({ name: r.name, type: r.type, maxUnits: r.maxUnits }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { name: project.name, tasks, dependencies, resources }
}

/**
 * Open real .mpp → save binary .mpp (OLE writer) → reopen → semantic identity.
 */
describe('MPP open/save round-trip (MS Project binary)', async () => {
  const status = await getMppEngineStatus()
  const ready = status.java && status.jar && status.mppWrite

  const fixtures = [
    '01-advanced-tasks.mpp',
    '05-advanced-plan.mpp',
    '06-advanced-tracking.mpp',
    '10-project-online-sample.mpp',
  ]

  it('MPP write engine is available after mpp:setup', async () => {
    if (!ready) {
      console.warn('[skip] run npm run mpp:setup for MPP write')
      return
    }
    expect(status.mppWrite).toBe(true)
  })

  it.each(fixtures)(
    'round-trips %s with semantic identity',
    async (file) => {
      if (!ready) return

      const bytes = await readFile(path.join(FIXTURE_DIR, file))
      const xml = await convertMppBufferToXml(bytes, file)
      const ids = new SeqIds()
      const original = refreshProject(await new MspdiCodec(ids).parse(xml, file))

      // Baseline: MSPDI serialize→parse (isolates MPP container from XML float quirks)
      const mspdi = await new MspdiCodec(ids).serialize(original)
      const baseline = refreshProject(
        await new MspdiCodec(new SeqIds()).parse(mspdi.content, file),
      )

      const written = await convertXmlToMppBuffer(mspdi.content, file.replace(/\.mpp$/i, '.xml'))
      expect(written.byteLength).toBeGreaterThan(1000)
      // OLE compound signature (D0 CF 11 E0) — real MS Project binary
      expect(written[0]).toBe(0xd0)
      expect(written[1]).toBe(0xcf)
      expect(written[2]).toBe(0x11)
      expect(written[3]).toBe(0xe0)

      const xml2 = await convertMppBufferToXml(written, `round-${file}`)
      const reopened = refreshProject(
        await new MspdiCodec(new SeqIds()).parse(xml2, `round-${file}`),
      )

      expect(projectSnapshot(reopened)).toEqual(projectSnapshot(baseline))

      // Codec serialize path
      const codec = new MppCodec(
        new SeqIds(),
        {
          convert: async (buf, name) =>
            convertMppBufferToXml(Buffer.from(buf), name),
        },
        {
          convert: async (x) => new Uint8Array(await convertXmlToMppBuffer(x)),
        },
      )
      const { content, extension } = await codec.serialize(original)
      expect(extension).toBe('.mpp')
      expect(content).toBeInstanceOf(Uint8Array)
      expect((content as Uint8Array)[0]).toBe(0xd0)
    },
    180_000,
  )
})
