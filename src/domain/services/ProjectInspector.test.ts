import { describe, expect, it } from 'vitest'
import { Task } from '../entities/Task'
import { Dependency } from '../entities/Dependency'
import { Duration } from '../value-objects/Duration'
import { Money } from '../value-objects/Money'
import { asDependencyId, asTaskId } from '../value-objects/Ids'
import { inspectProject, type InspectionFinding } from './ProjectInspector'

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m - 1, d!, 8, 0, 0, 0)
}

function task(
  id: string,
  name: string,
  durationHours = 8,
  extras: Partial<ReturnType<Task['toProps']>> = {},
) {
  return Task.create({
    id: asTaskId(id),
    name,
    outlineLevel: 0,
    wbs: id,
    start: day('2026-01-05'),
    finish: day('2026-01-05'),
    duration: Duration.hours(durationHours),
    percentComplete: 0,
    milestone: durationHours === 0,
    summary: false,
    critical: false,
    notes: '',
    priority: 500,
    constraintType: 'asSoonAsPossible',
    constraintDate: null,
    fixedCost: Money.zero(),
    cost: Money.zero(),
    workHours: durationHours,
    schedulingType: 'fixedUnits',
    effortDriven: true,
    parentId: null,
    baseline: null,
    collapsed: false,
    ...extras,
  })
}

function dep(id: string, pred: string, succ: string, type: 'FS' | 'SS' | 'FF' | 'SF' = 'FS') {
  return Dependency.create({
    id: asDependencyId(id),
    predecessorId: asTaskId(pred),
    successorId: asTaskId(succ),
    type,
    lag: Duration.zero(),
  })
}

function errors(findings: InspectionFinding[]) {
  return findings.filter((f) => f.severity === 'error')
}

function warnings(findings: InspectionFinding[]) {
  return findings.filter((f) => f.severity === 'warning')
}

describe('ProjectInspector', () => {
  describe('circular dependencies', () => {
    it('detects a simple A→B→A cycle', () => {
      const tasks = [task('1', 'Design'), task('2', 'Develop')]
      const deps = [dep('d1', '1', '2'), dep('d2', '2', '1')]
      const findings = inspectProject(tasks, deps)

      const circular = findings.filter((f) => f.category === 'circular-dependency')
      expect(circular).toHaveLength(1)
      expect(circular[0]!.severity).toBe('error')
      expect(circular[0]!.cyclePath).toBeDefined()
      expect(circular[0]!.cyclePathLabel).toContain('Design')
      expect(circular[0]!.cyclePathLabel).toContain('Develop')
    })

    it('detects a three-task cycle A→B→C→A', () => {
      const tasks = [
        task('1', 'Analysis'),
        task('2', 'Design'),
        task('3', 'Implementation'),
      ]
      const deps = [
        dep('d1', '1', '2'),
        dep('d2', '2', '3'),
        dep('d3', '3', '1'),
      ]
      const findings = inspectProject(tasks, deps)

      const circular = findings.filter((f) => f.category === 'circular-dependency')
      expect(circular).toHaveLength(1)
      expect(circular[0]!.cyclePathLabel).toContain('Analysis')
      expect(circular[0]!.cyclePathLabel).toContain('Design')
      expect(circular[0]!.cyclePathLabel).toContain('Implementation')
    })

    it('detects a self-loop through indirect means', () => {
      // This tests a 2-edge path that forms a cycle
      const tasks = [task('1', 'Task A'), task('2', 'Task B')]
      const deps = [dep('d1', '1', '2', 'SS'), dep('d2', '2', '1', 'FF')]
      const findings = inspectProject(tasks, deps)

      const circular = findings.filter((f) => f.category === 'circular-dependency')
      expect(circular).toHaveLength(1)
      expect(circular[0]!.cyclePath).toBeDefined()
    })

    it('shows link type in cycle path label', () => {
      const tasks = [task('1', 'A'), task('2', 'B')]
      const deps = [dep('d1', '1', '2', 'SS'), dep('d2', '2', '1', 'FF')]
      const findings = inspectProject(tasks, deps)

      const circular = findings.filter((f) => f.category === 'circular-dependency')
      expect(circular).toHaveLength(1)
      expect(circular[0]!.cyclePathLabel).toMatch(/SS/)
      expect(circular[0]!.cyclePathLabel).toMatch(/FF/)
    })

    it('returns zero findings for a clean project', () => {
      const tasks = [task('1', 'A'), task('2', 'B'), task('3', 'C')]
      const deps = [dep('d1', '1', '2'), dep('d2', '2', '3')]
      const findings = inspectProject(tasks, deps)

      expect(errors(findings)).toHaveLength(0)
      expect(warnings(findings)).toHaveLength(0)
    })

    it('handles a project with no dependencies', () => {
      const tasks = [task('1', 'A'), task('2', 'B')]
      const findings = inspectProject(tasks, [])

      expect(findings).toHaveLength(0)
    })

    it('handles a project with multiple independent chains', () => {
      const tasks = [
        task('1', 'A'),
        task('2', 'B'),
        task('3', 'C'),
        task('4', 'D'),
      ]
      const deps = [dep('d1', '1', '2'), dep('d2', '3', '4')]
      const findings = inspectProject(tasks, deps)

      expect(errors(findings)).toHaveLength(0)
    })
  })

  describe('dangling dependencies', () => {
    it('detects a dependency where predecessor does not exist', () => {
      const tasks = [task('2', 'B')]
      const deps = [dep('d1', '1', '2')]
      const findings = inspectProject(tasks, deps)

      const dangling = findings.filter((f) => f.category === 'dangling-dependency')
      expect(dangling).toHaveLength(1)
      expect(dangling[0]!.message).toMatch(/predecessor/)
      expect(dangling[0]!.message).toMatch(/"1"/)
    })

    it('detects a dependency where successor does not exist', () => {
      const tasks = [task('1', 'A')]
      const deps = [dep('d1', '1', '2')]
      const findings = inspectProject(tasks, deps)

      const dangling = findings.filter((f) => f.category === 'dangling-dependency')
      expect(dangling).toHaveLength(1)
      expect(dangling[0]!.message).toMatch(/successor/)
    })
  })

  describe('duplicate dependencies', () => {
    it('detects duplicate predecessor→successor pairs', () => {
      const tasks = [task('1', 'A'), task('2', 'B')]
      const deps = [dep('d1', '1', '2'), dep('d2', '1', '2', 'SS')]
      const findings = inspectProject(tasks, deps)

      const dups = findings.filter((f) => f.category === 'duplicate-dependency')
      expect(dups).toHaveLength(1)
      expect(dups[0]!.severity).toBe('warning')
      expect(dups[0]!.message).toMatch(/Duplicate/)
      expect(dups[0]!.message).toMatch(/A/)
      expect(dups[0]!.message).toMatch(/B/)
    })

    it('does not flag distinct pairs', () => {
      const tasks = [task('1', 'A'), task('2', 'B'), task('3', 'C')]
      const deps = [dep('d1', '1', '2'), dep('d2', '1', '3')]
      const findings = inspectProject(tasks, deps)

      const dups = findings.filter((f) => f.category === 'duplicate-dependency')
      expect(dups).toHaveLength(0)
    })
  })

  describe('self-dependency', () => {
    it('detects a task depending on itself (defense in depth for deserialized data)', () => {
      // Dependency.create rejects self-deps, but inspectProject guards
      // against data that might bypass that validation (e.g. deserialization).
      const tasks = [task('1', 'A')]
      // Bypass Dependency.create — exercise the inspection directly
      const selfDep = {
        id: asDependencyId('d1'),
        predecessorId: asTaskId('1'),
        successorId: asTaskId('1'),
        type: 'FS' as const,
        lag: Duration.zero(),
      } as unknown as Dependency
      // Access internal props to call inspectProject with the raw data
      const findings = inspectProject(tasks, [selfDep])

      const self = findings.filter((f) => f.category === 'self-dependency')
      expect(self).toHaveLength(1)
      expect(self[0]!.severity).toBe('error')
    })
  })

  describe('combined inspections', () => {
    it('reports both circular and duplicate in the same project', () => {
      const tasks = [task('1', 'A'), task('2', 'B')]
      const deps = [
        dep('d1', '1', '2'),
        dep('d2', '2', '1'),
        dep('d3', '1', '2', 'SS'),
      ]
      const findings = inspectProject(tasks, deps)

      const circular = findings.filter((f) => f.category === 'circular-dependency')
      const dups = findings.filter((f) => f.category === 'duplicate-dependency')
      expect(circular).toHaveLength(1)
      expect(dups).toHaveLength(1)
    })

    it('sorts errors before warnings', () => {
      const tasks = [task('1', 'A'), task('2', 'B')]
      const deps = [
        dep('d1', '1', '2'),
        dep('d2', '2', '1'), // circular - error
        dep('d3', '1', '2', 'SS'), // duplicate - warning
      ]
      const findings = inspectProject(tasks, deps)

      const firstError = findings.findIndex((f) => f.severity === 'error')
      const firstWarning = findings.findIndex((f) => f.severity === 'warning')
      expect(firstError).toBeLessThan(firstWarning)
    })
  })

  describe('larger graphs', () => {
    it('handles a diamond without false positives', () => {
      const tasks = [
        task('1', 'A'),
        task('2', 'B1'),
        task('3', 'B2'),
        task('4', 'C'),
      ]
      const deps = [
        dep('d1', '1', '2'),
        dep('d2', '1', '3'),
        dep('d3', '2', '4'),
        dep('d4', '3', '4'),
      ]
      const findings = inspectProject(tasks, deps)

      // Diamond is a DAG — no cycles
      const circular = findings.filter((f) => f.category === 'circular-dependency')
      expect(circular).toHaveLength(0)
    })

    it('handles a longer cycle A→B→C→D→E→B', () => {
      const tasks = [
        task('1', 'A'),
        task('2', 'B'),
        task('3', 'C'),
        task('4', 'D'),
        task('5', 'E'),
      ]
      const deps = [
        dep('d1', '1', '2'),
        dep('d2', '2', '3'),
        dep('d3', '3', '4'),
        dep('d4', '4', '5'),
        dep('d5', '5', '2'), // E→B creates cycle
      ]
      const findings = inspectProject(tasks, deps)

      const circular = findings.filter((f) => f.category === 'circular-dependency')
      expect(circular).toHaveLength(1)
    })
  })
})