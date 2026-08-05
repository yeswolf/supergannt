import { describe, expect, it } from 'vitest'
import { Dependency } from '../entities/Dependency'
import { Task } from '../entities/Task'
import { Duration } from '../value-objects/Duration'
import { Money } from '../value-objects/Money'
import { asDependencyId, asTaskId } from '../value-objects/Ids'
import {
  inspectDependencies,
  type InspectionReport,
} from './CircularDependencyDetector'

// ─── Helpers ────────────────────────────────────────────────────────────────

function task(id: string, name: string) {
  return Task.create({
    id: asTaskId(id),
    name,
    outlineLevel: 0,
    wbs: id,
    start: new Date('2026-01-05'),
    finish: new Date('2026-01-05'),
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

function dep(id: string, predId: string, succId: string, type: 'FS' | 'FF' | 'SS' | 'SF' = 'FS') {
  return Dependency.create({
    id: asDependencyId(id),
    predecessorId: asTaskId(predId),
    successorId: asTaskId(succId),
    type,
    lag: Duration.zero(),
  })
}

function extractCycles(report: InspectionReport): string[][] {
  return report.cycles.map((c) => c.path.map(String))
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CircularDependencyDetector', () => {
  it('detects no cycles in an acyclic graph', () => {
    const tasks = [task('1', 'A'), task('2', 'B'), task('3', 'C')]
    const deps = [dep('d1', '1', '2'), dep('d2', '2', '3')]
    const report = inspectDependencies(tasks, deps)
    expect(report.acyclic).toBe(true)
    expect(report.cycles).toHaveLength(0)
    expect(report.summary).toContain('No circular dependencies')
  })

  it('detects a simple 2-node cycle (A→B→A)', () => {
    const tasks = [task('1', 'A'), task('2', 'B')]
    const deps = [dep('d1', '1', '2'), dep('d2', '2', '1')]
    const report = inspectDependencies(tasks, deps)

    expect(report.acyclic).toBe(false)
    expect(report.cycles).toHaveLength(1)
    expect(report.cycles[0]!.path).toHaveLength(3) // 1→2→1

    const path = extractCycles(report)
    expect(path[0]![0]).toBe(path[0]![path[0]!.length - 1]) // starts and ends with same
    expect(report.summary).toContain('1 circular dependency found')
  })

  it('detects a 3-node cycle (A→B→C→A)', () => {
    const tasks = [task('1', 'A'), task('2', 'B'), task('3', 'C')]
    const deps = [dep('d1', '1', '2'), dep('d2', '2', '3'), dep('d3', '3', '1')]
    const report = inspectDependencies(tasks, deps)

    expect(report.acyclic).toBe(false)
    expect(report.cycles).toHaveLength(1)
    expect(report.cycles[0]!.path).toHaveLength(4) // includes duplicate start/end
    const desc = report.cycles[0]!.description
    expect(desc).toContain('A')
    expect(desc).toContain('B')
    expect(desc).toContain('C')
  })

  it('Dependency entity prevents self-loops at construction', () => {
    // The Dependency entity rejects self-loops — the detector never sees them.
    expect(() => dep('d-self', '1', '1')).toThrow(/itself/)
  })

  it('detects multiple cycles and sorts by length', () => {
    // Graph: 1→2, 2→1 (2-cycle), 1→3→4→1 (3-cycle), plus 5→6→7→5 (3-cycle)
    const tasks = [
      task('1', 'A'), task('2', 'B'), task('3', 'C'),
      task('4', 'D'), task('5', 'E'), task('6', 'F'),
      task('7', 'G'),
    ]
    const deps = [
      dep('d1', '1', '2'), dep('d2', '2', '1'),   // 2-cycle
      dep('d3', '1', '3'), dep('d4', '3', '4'), dep('d5', '4', '1'), // 3-cycle
      dep('d6', '5', '6'), dep('d7', '6', '7'), dep('d8', '7', '5'), // 3-cycle
    ]
    const report = inspectDependencies(tasks, deps)

    expect(report.acyclic).toBe(false)
    expect(report.cycles.length).toBeGreaterThanOrEqual(2)

    // Sorted shortest-first
    const lengths = report.cycles.map((c) => c.path.length)
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]!).toBeGreaterThanOrEqual(lengths[i - 1]!)
    }

    expect(report.summary).toContain('circular dependencies found')
  })

  it('detects orphan tasks (isolated, no predecessors, no successors)', () => {
    const tasks = [
      task('1', 'A'), task('2', 'B'), task('3', 'C'),
      task('4', 'D'), task('5', 'E'),
    ]
    const deps = [
      dep('d1', '1', '2'), // A→B
      dep('d2', '2', '3'), // B→C — so A has no pred, C has no succ
    ]
    // Task 4 and 5 have no deps at all — isolated
    const report = inspectDependencies(tasks, deps)

    expect(report.orphanTasks).toHaveLength(4)

    const isolated = report.orphanTasks.filter((o) => o.reason === 'isolated')
    expect(isolated).toHaveLength(2)
    expect(isolated.map((o) => o.taskId).sort()).toEqual(['4', '5'])

    const noPred = report.orphanTasks.find((o) => o.reason === 'noPredecessors')
    expect(noPred?.taskId).toBe('1')

    const noSucc = report.orphanTasks.find((o) => o.reason === 'noSuccessors')
    expect(noSucc?.taskId).toBe('3')

    expect(report.summary).toContain('orphan tasks')
  })

  it('detects dangling references', () => {
    const tasks = [task('1', 'A'), task('2', 'B')]
    const deps = [
      dep('d1', '1', '99'), // 99 doesn't exist
      dep('d2', '88', '2'), // 88 doesn't exist
    ]
    const report = inspectDependencies(tasks, deps)

    expect(report.danglingReferences).toHaveLength(2)
    const missingIds = report.danglingReferences.map((d) => d.missingTaskId).sort()
    expect(missingIds).toEqual(['88', '99'])

    const roles = report.danglingReferences.map((d) => d.role).sort()
    expect(roles).toEqual(['predecessor', 'successor'])

    expect(report.summary).toContain('dangling references')
  })

  it('detects redundant dependencies', () => {
    // A→B→C, and also A→C directly — A→C is redundant
    const tasks = [task('1', 'A'), task('2', 'B'), task('3', 'C')]
    const deps = [
      dep('d1', '1', '2'),
      dep('d2', '2', '3'),
      dep('d3', '1', '3'), // redundant: 1→2→3 already exists
    ]
    const report = inspectDependencies(tasks, deps)

    expect(report.redundantDependencies.length).toBeGreaterThanOrEqual(1)
    const redundant = report.redundantDependencies[0]!
    expect(redundant.dependencyId).toBe('d3')
    expect(redundant.predecessorId).toBe('1')
    expect(redundant.successorId).toBe('3')
    expect(redundant.transitivePath.length).toBeGreaterThanOrEqual(3)

    expect(report.summary).toContain('redundant dependencies')
  })

  it('returns an empty report for no tasks', () => {
    const report = inspectDependencies([], [])
    expect(report.acyclic).toBe(true)
    expect(report.cycles).toHaveLength(0)
    expect(report.orphanTasks).toHaveLength(0)
    expect(report.redundantDependencies).toHaveLength(0)
    expect(report.danglingReferences).toHaveLength(0)
  })

  it('handles tasks with no dependencies (all isolated)', () => {
    const tasks = [task('1', 'A'), task('2', 'B')]
    const report = inspectDependencies(tasks, [])

    expect(report.acyclic).toBe(true)
    expect(report.orphanTasks).toHaveLength(2)
    expect(report.orphanTasks.every((o) => o.reason === 'isolated')).toBe(true)
  })

  it('includes cycle description with task names', () => {
    const tasks = [task('1', 'Design'), task('2', 'Build'), task('3', 'Test')]
    const deps = [dep('d1', '1', '2'), dep('d2', '2', '3'), dep('d3', '3', '1')]
    const report = inspectDependencies(tasks, deps)

    expect(report.cycles[0]!.description).toBeDefined()
    expect(report.cycles[0]!.description.length).toBeGreaterThan(0)
    // Should contain the task names
    const desc = report.cycles[0]!.description
    expect(desc).toContain('Design')
    expect(desc).toContain('Build')
    expect(desc).toContain('Test')
  })

  it('dependencyIds in cycles match the edges in the cycle', () => {
    const tasks = [task('1', 'A'), task('2', 'B'), task('3', 'C')]
    const deps = [dep('d1', '1', '2'), dep('d2', '2', '3'), dep('d3', '3', '1')]
    const report = inspectDependencies(tasks, deps)

    const cycle = report.cycles[0]!
    expect(cycle.dependencyIds).toHaveLength(3)
    // Each dependency ID should be one of the created deps
    for (const depId of cycle.dependencyIds) {
      expect(['d1', 'd2', 'd3']).toContain(depId)
    }
  })
})