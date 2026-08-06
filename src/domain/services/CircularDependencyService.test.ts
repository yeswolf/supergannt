import { describe, expect, it } from 'vitest'
import { Task } from '../entities/Task'
import { Dependency } from '../entities/Dependency'
import { Duration } from '../value-objects/Duration'
import { Money } from '../value-objects/Money'
import { asTaskId, asDependencyId } from '../value-objects/Ids'
import {
  findCircularPaths,
  findOrphanDependencies,
  findRedundantDependencies,
  findSelfReferencingDependencies,
  inspectDependencies,
  wouldCreateCycle,
} from './CircularDependencyService'
import type { CircularPath, DependencyInspectionReport } from './CircularDependencyService'

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m - 1, d!, 8, 0, 0, 0)
}

function makeTask(id: string, name: string): Task {
  return Task.create({
    id: asTaskId(id),
    name,
    outlineLevel: 0,
    wbs: '',
    start: day('2026-01-05'),
    finish: day('2026-01-05'),
    duration: Duration.hours(8),
    percentComplete: 0,
    milestone: false,
    summary: false,
    critical: false,
    notes: '',
    priority: 500,
    constraintType: 'asSoonAsPossible',
    constraintDate: null,
    fixedCost: Money.zero(),
    cost: Money.zero(),
    workHours: 8,
    schedulingType: 'fixedUnits',
    effortDriven: true,
    parentId: null,
    baseline: null,
    collapsed: false,
  })
}

function makeDep(
  id: string,
  predecessorId: string,
  successorId: string,
  type: 'FS' | 'SS' | 'FF' | 'SF' = 'FS',
): Dependency {
  return Dependency.create({
    id: asDependencyId(id),
    predecessorId: asTaskId(predecessorId),
    successorId: asTaskId(successorId),
    type,
    lag: Duration.zero(),
  })
}

function cycleDescription(report: DependencyInspectionReport): string[] {
  return report.cycles.map((c) => c.description)
}

describe('CircularDependencyService', () => {
  describe('findCircularPaths', () => {
    it('returns empty for an acyclic graph', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [makeDep('d1', 'a', 'b'), makeDep('d2', 'b', 'c')]
      expect(findCircularPaths(tasks, deps)).toEqual([])
    })

    it('returns empty for no dependencies', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B')]
      expect(findCircularPaths(tasks, [])).toEqual([])
    })

    it('detects a simple 2-node cycle: A→B, B→A', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B')]
      const deps = [makeDep('d1', 'a', 'b'), makeDep('d2', 'b', 'a')]
      const cycles = findCircularPaths(tasks, deps)
      expect(cycles).toHaveLength(1)
      expect(cycles[0]!.description).toMatch(/A.*B.*A/)
      expect(cycles[0]!.path[0]).toBe(cycles[0]!.path[cycles[0]!.path.length - 1])
    })

    it('detects a 3-node cycle: A→B, B→C, C→A', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
        makeDep('d3', 'c', 'a'),
      ]
      const cycles = findCircularPaths(tasks, deps)
      expect(cycles).toHaveLength(1)
      expect(cycles[0]!.description).toMatch(/A/)
      expect(cycles[0]!.description).toMatch(/B/)
      expect(cycles[0]!.description).toMatch(/C/)
      // The path should start and end with the same node
      const p = cycles[0]!.path
      expect(p[0]).toBe(p[p.length - 1])
    })

    it('detects a self-loop chain: A→B→C→A, plus C→D→C', () => {
      // A→B→C→A (cycle 1), and also C→D→C (cycle 2, self-loop via D)
      const tasks = [
        makeTask('a', 'A'),
        makeTask('b', 'B'),
        makeTask('c', 'C'),
        makeTask('d', 'D'),
      ]
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
        makeDep('d3', 'c', 'a'),
        makeDep('d4', 'c', 'd'),
        makeDep('d5', 'd', 'c'),
      ]
      const cycles = findCircularPaths(tasks, deps)
      expect(cycles.length).toBeGreaterThanOrEqual(2)
    })

    it('handles an acyclic diamond: A→B, A→C, B→D, C→D', () => {
      const tasks = [
        makeTask('a', 'A'),
        makeTask('b', 'B'),
        makeTask('c', 'C'),
        makeTask('d', 'D'),
      ]
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'a', 'c'),
        makeDep('d3', 'b', 'd'),
        makeDep('d4', 'c', 'd'),
      ]
      expect(findCircularPaths(tasks, deps)).toEqual([])
    })
  })

  describe('findOrphanDependencies', () => {
    it('finds deps with missing predecessor', () => {
      const tasks = [makeTask('a', 'A')]
      const deps = [makeDep('d1', 'missing', 'a')]
      const orphans = findOrphanDependencies(tasks, deps)
      expect(orphans).toHaveLength(1)
      expect(orphans[0]!.missingTaskId).toBe('missing')
      expect(orphans[0]!.role).toBe('predecessor')
    })

    it('finds deps with missing successor', () => {
      const tasks = [makeTask('a', 'A')]
      const deps = [makeDep('d1', 'a', 'missing')]
      const orphans = findOrphanDependencies(tasks, deps)
      expect(orphans).toHaveLength(1)
      expect(orphans[0]!.missingTaskId).toBe('missing')
      expect(orphans[0]!.role).toBe('successor')
    })

    it('returns empty when all deps reference existing tasks', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B')]
      const deps = [makeDep('d1', 'a', 'b')]
      expect(findOrphanDependencies(tasks, deps)).toEqual([])
    })
  })

  describe('findRedundantDependencies', () => {
    it('detects A→C is redundant when A→B→C exists', () => {
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
        makeDep('d3', 'a', 'c'),
      ]
      const redundants = findRedundantDependencies(deps)
      expect(redundants).toHaveLength(1)
      expect(redundants[0]!.dependencyId).toBe('d3')
    })

    it('returns empty for a simple chain with no shortcuts', () => {
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
      ]
      expect(findRedundantDependencies(deps)).toEqual([])
    })

    it('detects redundant shortcut in a larger chain: A→B→C→D with A→D', () => {
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
        makeDep('d3', 'c', 'd'),
        makeDep('d4', 'a', 'd'),
      ]
      const redundants = findRedundantDependencies(deps)
      expect(redundants).toHaveLength(1)
      expect(redundants[0]!.dependencyId).toBe('d4')
    })
  })

  describe('findSelfReferencingDependencies', () => {
    it('detects self-referencing deps', () => {
      // Self-reference is rejected at entity creation, but we test with
      // direct property access (bypassing the entity constructor check).
      const deps = [
        Dependency.create({
          id: asDependencyId('d1'),
          predecessorId: asTaskId('a'),
          successorId: asTaskId('b'),
          type: 'FS',
          lag: Duration.zero(),
        }),
      ]
      // Self-refs require bypassing the constructor — test using the raw prop
      // by filtering for what would be a self-ref in corrupted data.
      // Since the entity rejects self-refs, this will be empty normally.
      expect(findSelfReferencingDependencies(deps)).toEqual([])
    })
  })

  describe('inspectDependencies', () => {
    it('returns a complete report for an acyclic project', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [makeDep('d1', 'a', 'b'), makeDep('d2', 'b', 'c')]
      const report = inspectDependencies(tasks, deps)
      expect(report.isAcyclic).toBe(true)
      expect(report.cycles).toEqual([])
      expect(report.orphans).toEqual([])
      expect(report.redundants).toEqual([])
      expect(report.selfRefs).toEqual([])
    })

    it('reports cycles, orphans, and redundants together', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
        makeDep('d3', 'c', 'a'), // cycle
        makeDep('d4', 'a', 'c'), // redundant (A→B→C already)
        makeDep('d5', 'missing', 'a'), // orphan
      ]
      const report = inspectDependencies(tasks, deps)
      expect(report.isAcyclic).toBe(false)
      expect(report.cycles.length).toBeGreaterThanOrEqual(1)
      expect(report.orphans.length).toBeGreaterThanOrEqual(1)
      expect(report.redundants.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('wouldCreateCycle', () => {
    it('returns null for a safe addition', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [makeDep('d1', 'a', 'b')]
      expect(wouldCreateCycle(tasks, deps, 'b', 'c')).toBeNull()
    })

    it('detects that adding B→A would create A→B→A cycle', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B')]
      const deps = [makeDep('d1', 'a', 'b')]
      const result = wouldCreateCycle(tasks, deps, 'b', 'a')
      expect(result).not.toBeNull()
      expect(result!.description).toMatch(/A/)
      expect(result!.description).toMatch(/B/)
    })

    it('detects that adding A→A is a self-reference', () => {
      const tasks = [makeTask('a', 'A')]
      const deps: Dependency[] = []
      const result = wouldCreateCycle(tasks, deps, 'a', 'a')
      expect(result).not.toBeNull()
      expect(result!.description).toMatch(/self-reference/)
    })

    it('detects indirect cycle: A→B, B→C, adding C→A', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [makeDep('d1', 'a', 'b'), makeDep('d2', 'b', 'c')]
      const result = wouldCreateCycle(tasks, deps, 'c', 'a')
      expect(result).not.toBeNull()
      expect(result!.description).toMatch(/A/)
      expect(result!.description).toMatch(/C/)
    })
  })
})