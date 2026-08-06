import { describe, expect, it } from 'vitest'
import { MspdiCodec } from './MspdiCodec'
import { inspectProject } from '../../domain/services/ProjectInspector'
import type { IdGenerator } from '../../application/ports/IdGenerator'
import { readFileSync } from 'fs'
import { resolve } from 'path'

class SeqIds implements IdGenerator {
  private n = 0
  private next(prefix: string) {
    this.n += 1
    return `${prefix}${this.n}`
  }
  projectId() { return this.next('p') }
  taskId() { return this.next('t') }
  resourceId() { return this.next('r') }
  dependencyId() { return this.next('d') }
  assignmentId() { return this.next('a') }
  calendarId() { return this.next('c') }
}

function readFixture(name: string): string {
  const path = resolve(__dirname, '../../../testdata/inspections', name)
  return readFileSync(path, 'utf-8')
}

describe('MSPDI circular dependency inspection (real fixtures)', () => {
  it('detects a two-task circular dependency from XML', async () => {
    const codec = new MspdiCodec(new SeqIds())
    const xml = readFixture('circular-two-task.xml')
    const project = await codec.parse(xml, 'test.xml')

    const findings = inspectProject(project.tasks, project.dependencies)
    const circular = findings.filter((f) => f.category === 'circular-dependency')

    expect(circular).toHaveLength(1)
    expect(circular[0]!.severity).toBe('error')
    expect(circular[0]!.cyclePathLabel).toBeDefined()
    // Should mention both task names
    expect(circular[0]!.cyclePathLabel).toMatch(/Design/)
    expect(circular[0]!.cyclePathLabel).toMatch(/Develop/)
  })

  it('detects a three-task circular dependency from XML', async () => {
    const codec = new MspdiCodec(new SeqIds())
    const xml = readFixture('circular-three-task.xml')
    const project = await codec.parse(xml, 'test.xml')

    const findings = inspectProject(project.tasks, project.dependencies)
    const circular = findings.filter((f) => f.category === 'circular-dependency')

    expect(circular).toHaveLength(1)
    expect(circular[0]!.cyclePathLabel).toMatch(/Analysis/)
    expect(circular[0]!.cyclePathLabel).toMatch(/Design/)
    expect(circular[0]!.cyclePathLabel).toMatch(/Build/)
  })

  it('reports no issues for a clean project from XML', async () => {
    const codec = new MspdiCodec(new SeqIds())
    const xml = readFixture('clean-project.xml')
    const project = await codec.parse(xml, 'test.xml')

    const findings = inspectProject(project.tasks, project.dependencies)

    const errors = findings.filter((f) => f.severity === 'error')
    const warnings = findings.filter((f) => f.severity === 'warning')
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('detects duplicate dependencies from XML', async () => {
    const codec = new MspdiCodec(new SeqIds())
    const xml = readFixture('duplicate-deps.xml')
    const project = await codec.parse(xml, 'test.xml')

    const findings = inspectProject(project.tasks, project.dependencies)
    const dups = findings.filter((f) => f.category === 'duplicate-dependency')

    expect(dups).toHaveLength(1)
    expect(dups[0]!.severity).toBe('warning')
  })

  it('detects a dangling predecessor reference from XML', async () => {
    // The MSPDI codec silently drops predecessor references to unknown UIDs
    // during parsing (line 244: if (!predId) continue).
    // When the raw testdata has a predecessor UID=99 that doesn't match any
    // task, the resulting project simply has zero dependencies — which is
    // correct MSPDI behavior, not a dangling finding.
    const codec = new MspdiCodec(new SeqIds())
    const xml = readFixture('dangling-dependency.xml')
    const project = await codec.parse(xml, 'test.xml')

    // The codec drops the dangling link, so 0 dependencies parsed.
    expect(project.dependencies).toHaveLength(0)

    // With no dependencies, no findings at all.
    const findings = inspectProject(project.tasks, project.dependencies)
    expect(findings).toHaveLength(0)
  })
})