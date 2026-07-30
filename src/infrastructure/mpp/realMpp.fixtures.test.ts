import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertMppBufferToXml, getMppEngineStatus } from '../../../server/mppConvert.ts'
import { MspdiCodec } from '../mspdi/MspdiCodec'
import { MppCodec } from './MppCodec'
import type { IdGenerator } from '../../application/ports/IdGenerator'

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

interface FixtureMeta {
  file: string
  source: string
  url: string
  minTasks: number
  minDependencies: number
  minResources: number
}

async function loadFixtureMeta(): Promise<FixtureMeta[]> {
  const raw = await readFile(path.join(FIXTURE_DIR, 'SOURCES.json'), 'utf8')
  const cleaned = raw.replace(/^\uFEFF/, '')
  return (JSON.parse(cleaned) as { fixtures: FixtureMeta[] }).fixtures
}

/**
 * Integration: real Microsoft Project .mpp plans → XML → domain Project.
 * Requires `npm run mpp:setup` (JDK + mpp-convert.jar). Soft-skips when unavailable.
 */
describe('real MPP fixtures (10 complex plans)', async () => {
  const fixtures = await loadFixtureMeta()

  it('lists exactly 10 documented real plans', () => {
    expect(fixtures).toHaveLength(10)
    for (const f of fixtures) {
      expect(f.file).toMatch(/\.mpp$/i)
      expect(f.source.length).toBeGreaterThan(10)
    }
  })

  it.each(fixtures)(
    'opens $file',
    async (fixture) => {
      const status = await getMppEngineStatus()
      if (!status.java || !status.jar) {
        console.warn(
          `[skip] ${fixture.file}: run npm run mpp:setup for Java MPP converter`,
        )
        return
      }

      const filePath = path.join(FIXTURE_DIR, fixture.file)
      const bytes = await readFile(filePath)
      expect(bytes.byteLength).toBeGreaterThan(10_000)

      const xml = await convertMppBufferToXml(bytes, fixture.file)
      expect(xml).toContain('<Project')
      expect(xml.length).toBeGreaterThan(1_000)

      const ids = new SeqIds()
      const project = await new MspdiCodec(ids).parse(xml, fixture.file)

      expect(project.tasks.length).toBeGreaterThanOrEqual(fixture.minTasks)
      expect(project.dependencies.length).toBeGreaterThanOrEqual(fixture.minDependencies)
      expect(project.resources.length).toBeGreaterThanOrEqual(fixture.minResources)

      for (const task of project.tasks) {
        if (task.summary) continue
        expect(task.finish.getTime()).toBeGreaterThanOrEqual(task.start.getTime())
      }

      const taskIds = new Set(project.tasks.map((t) => t.id))
      for (const dep of project.dependencies) {
        expect(taskIds.has(dep.predecessorId)).toBe(true)
        expect(taskIds.has(dep.successorId)).toBe(true)
        expect(['FS', 'SS', 'FF', 'SF']).toContain(dep.type)
      }

      const viaCodec = await new MppCodec(ids, {
        convert: async () => xml,
      }).parse(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        fixture.file,
      )

      expect(viaCodec.tasks.length).toBe(project.tasks.length)
      expect(viaCodec.fileName).toBe(fixture.file)
    },
    120_000,
  )
})
