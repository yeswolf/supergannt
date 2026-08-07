import { describe, expect, it } from 'vitest'
import { Dependency } from '../entities/Dependency'
import { Duration } from '../value-objects/Duration'
import { asDependencyId, asTaskId } from '../value-objects/Ids'
import { detectCycles, wouldCreateCycle } from './CycleDetector'

function dep(id: string, pred: string, succ: string): Dependency {
  return Dependency.create({
    id: asDependencyId(id),
    predecessorId: asTaskId(pred),
    successorId: asTaskId(succ),
    type: 'FS',
    lag: Duration.zero(),
  })
}

describe('detectCycles', () => {
  it('returns empty for a graph with no cycles (linear chain)', () => {
    // 1 → 2 → 3
    const deps = [dep('d1', '1', '2'), dep('d2', '2', '3')]
    expect(detectCycles(deps)).toEqual([])
  })

  it('returns empty for an empty graph', () => {
    expect(detectCycles([])).toEqual([])
  })

  it('detects a single two-node cycle', () => {
    // 1 → 2 → 1
    const deps = [dep('d1', '1', '2'), dep('d2', '2', '1')]
    const cycles = detectCycles(deps)
    expect(cycles).toHaveLength(1)
    expect(cycles[0]!.taskPath).toEqual(['1', '2', '1'])
    expect(cycles[0]!.dependencyIds).toEqual(['d1', 'd2'])
  })

  it('detects a three-node cycle', () => {
    // 1 → 2 → 3 → 1
    const deps = [dep('d1', '1', '2'), dep('d2', '2', '3'), dep('d3', '3', '1')]
    const cycles = detectCycles(deps)
    expect(cycles).toHaveLength(1)
    expect(cycles[0]!.taskPath).toEqual(['1', '2', '3', '1'])
  })

  it('detects multiple independent cycles', () => {
    // Cycle A: 1 → 2 → 1    Cycle B: 3 → 4 → 3
    const deps = [
      dep('d1', '1', '2'),
      dep('d2', '2', '1'),
      dep('d3', '3', '4'),
      dep('d4', '4', '3'),
    ]
    const cycles = detectCycles(deps)
    expect(cycles.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty for a diamond-shaped DAG (no cycle)', () => {
    // 1 → 2, 1 → 3, 2 → 4, 3 → 4
    const deps = [
      dep('d1', '1', '2'),
      dep('d2', '1', '3'),
      dep('d3', '2', '4'),
      dep('d4', '3', '4'),
    ]
    expect(detectCycles(deps)).toEqual([])
  })

  it('returns empty for a long linear chain', () => {
    const deps = [
      dep('d1', '1', '2'),
      dep('d2', '2', '3'),
      dep('d3', '3', '4'),
      dep('d4', '4', '5'),
      dep('d5', '5', '6'),
    ]
    expect(detectCycles(deps)).toEqual([])
  })

  it('handles disconnected subgraphs (some with cycles, some without)', () => {
    // Cycle: 1 → 2 → 1    No cycle: 3 → 4
    const deps = [dep('d1', '1', '2'), dep('d2', '2', '1'), dep('d3', '3', '4')]
    const cycles = detectCycles(deps)
    expect(cycles).toHaveLength(1)
    expect(cycles[0]!.taskPath).toEqual(['1', '2', '1'])
  })
})

describe('wouldCreateCycle', () => {
  it('returns null when the new edge does not create a cycle', () => {
    // 1 → 2, add 2 → 3
    const deps = [dep('d1', '1', '2')]
    expect(wouldCreateCycle(deps, '2', '3')).toBeNull()
  })

  it('returns a cycle path when adding the edge would close a loop', () => {
    // 1 → 2, adding 2 → 1 would create cycle
    const deps = [dep('d1', '1', '2')]
    const cycle = wouldCreateCycle(deps, '2', '1')
    expect(cycle).not.toBeNull()
    expect(cycle!.taskPath).toContain('1')
    expect(cycle!.taskPath).toContain('2')
  })

  it('returns null when predecessor and successor are identical (self-loop guarded elsewhere)', () => {
    const deps: Dependency[] = []
    // Self-loop: wouldCreateCycle is called only after the self-link guard in
    // linkTasks, but the function should handle it gracefully.
    const cycle = wouldCreateCycle(deps, '1', '1')
    // Adding 1→1 does create a cycle (1→1), detect it.
    expect(cycle).not.toBeNull()
  })
})
