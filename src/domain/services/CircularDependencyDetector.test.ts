import { describe, expect, it } from 'vitest'
import { Dependency } from '../entities/Dependency'
import { Duration } from '../value-objects/Duration'
import {
  detectCircularDependencies,
  wouldCreateCycle,
  formatCyclePath,
} from './CircularDependencyDetector'

function dep(
  id: string,
  pred: string,
  succ: string,
): Dependency {
  return Dependency.create({
    id,
    predecessorId: pred,
    successorId: succ,
    type: 'FS',
    lag: Duration.zero(),
  })
}

describe('detectCircularDependencies', () => {
  it('returns no cycle for empty dependencies', () => {
    const result = detectCircularDependencies([])
    expect(result.hasCycle).toBe(false)
    expect(result.cyclePath).toEqual([])
  })

  it('returns no cycle for a simple chain A->B->C', () => {
    const deps = [dep('1', 'A', 'B'), dep('2', 'B', 'C')]
    const result = detectCircularDependencies(deps)
    expect(result.hasCycle).toBe(false)
  })

  it('returns no cycle for independent dependencies', () => {
    const deps = [dep('1', 'A', 'B'), dep('2', 'C', 'D')]
    const result = detectCircularDependencies(deps)
    expect(result.hasCycle).toBe(false)
  })

  it('detects a 2-node cycle A->B->A', () => {
    const deps = [dep('1', 'A', 'B'), dep('2', 'B', 'A')]
    const result = detectCircularDependencies(deps)
    expect(result.hasCycle).toBe(true)
    // The cycle can start at A or B depending on DFS order
    expect(result.cyclePath).toHaveLength(3)
    expect(result.cyclePath[0]).toBe(result.cyclePath[result.cyclePath.length - 1])
  })

  it('detects a 3-node cycle A->B->C->A', () => {
    const deps = [dep('1', 'A', 'B'), dep('2', 'B', 'C'), dep('3', 'C', 'A')]
    const result = detectCircularDependencies(deps)
    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath).toHaveLength(4)
    expect(result.cyclePath[0]).toBe(result.cyclePath[result.cyclePath.length - 1])
    // All three nodes should appear in the cycle
    expect(new Set(result.cyclePath.slice(0, -1)).size).toBe(3)
  })

  it('detects a self-loop (self-referencing not possible in Dependency but test edge case)', () => {
    // Self-loops are prevented by Dependency.create, but test the algo
    const deps = [dep('1', 'A', 'A')]
    const result = detectCircularDependencies(deps)
    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath).toHaveLength(2)
  })

  it('detects a 4-node diamond with a back edge creating a cycle', () => {
    const deps = [
      dep('1', 'A', 'B'),
      dep('2', 'A', 'C'),
      dep('3', 'B', 'D'),
      dep('4', 'C', 'D'),
      dep('5', 'D', 'A'),
    ]
    const result = detectCircularDependencies(deps)
    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath[0]).toBe(result.cyclePath[result.cyclePath.length - 1])
  })

  it('detects no cycle in a DAG with diamond', () => {
    const deps = [
      dep('1', 'A', 'B'),
      dep('2', 'A', 'C'),
      dep('3', 'B', 'D'),
      dep('4', 'C', 'D'),
    ]
    const result = detectCircularDependencies(deps)
    expect(result.hasCycle).toBe(false)
  })

  it('detects a cycle deeper in the graph (C->D->E->C)', () => {
    const deps = [
      dep('1', 'A', 'B'),
      dep('2', 'B', 'C'),
      dep('3', 'C', 'D'),
      dep('4', 'D', 'E'),
      dep('5', 'E', 'C'),
    ]
    const result = detectCircularDependencies(deps)
    expect(result.hasCycle).toBe(true)
    // Should contain C, D, E
    const innerNodes = result.cyclePath.slice(0, -1)
    expect(innerNodes).toContain('C')
    expect(innerNodes).toContain('D')
    expect(innerNodes).toContain('E')
  })
})

describe('wouldCreateCycle', () => {
  it('detects self-reference', () => {
    const result = wouldCreateCycle([], 'A', 'A')
    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath).toEqual(['A', 'A'])
  })

  it('detects 2-node cycle being created', () => {
    const deps = [dep('1', 'A', 'B')]
    const result = wouldCreateCycle(deps, 'B', 'A')
    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath).toEqual(['B', 'A', 'B'])
  })

  it('detects 3-node cycle being created by closing the loop', () => {
    const deps = [dep('1', 'A', 'B'), dep('2', 'B', 'C')]
    const result = wouldCreateCycle(deps, 'C', 'A')
    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath).toEqual(['C', 'A', 'B', 'C'])
  })

  it('allows new independent edge', () => {
    const deps = [dep('1', 'A', 'B'), dep('2', 'B', 'C')]
    const result = wouldCreateCycle(deps, 'X', 'Y')
    expect(result.hasCycle).toBe(false)
  })

  it('allows extending a chain', () => {
    const deps = [dep('1', 'A', 'B'), dep('2', 'B', 'C')]
    const result = wouldCreateCycle(deps, 'C', 'D')
    expect(result.hasCycle).toBe(false)
  })

  it('detects cycle with no existing deps', () => {
    const result = wouldCreateCycle([], 'A', 'A')
    expect(result.hasCycle).toBe(true)
  })

  it('allows edge between unconnected nodes', () => {
    const deps = [dep('1', 'A', 'B')]
    const result = wouldCreateCycle(deps, 'C', 'D')
    expect(result.hasCycle).toBe(false)
  })

  it('detects a cycle in a diamond graph A→B, B→C, A→D, D→C when adding C→A', () => {
    // Diamond: A→B→C and A→D→C (two paths to C).
    // Adding C→A creates cycle C→A→B→C.
    // The old BFS parent-overwrite bug would produce incorrect C→A→C.
    const deps = [
      dep('1', 'A', 'B'),
      dep('2', 'B', 'C'),
      dep('3', 'A', 'D'),
      dep('4', 'D', 'C'),
    ]
    const result = wouldCreateCycle(deps, 'C', 'A')
    expect(result.hasCycle).toBe(true)
    // DFS from A finds B→C as the correct path: C→A→B→C
    expect(result.cyclePath).toEqual(['C', 'A', 'B', 'C'])
  })
})

describe('formatCyclePath', () => {
  it('formats a cycle path with task IDs only', () => {
    const msg = formatCyclePath(['A', 'B', 'C', 'A'])
    expect(msg).toBe('Circular dependency detected: A → B → C → A')
  })

  it('formats a cycle path with task names when available', () => {
    const taskMap = new Map([
      ['t1', 'Design'],
      ['t2', 'Development'],
      ['t3', 'Testing'],
    ])
    const msg = formatCyclePath(['t1', 't2', 't3', 't1'], taskMap)
    expect(msg).toBe('Circular dependency detected: "Design" (t1) → "Development" (t2) → "Testing" (t3) → "Design" (t1)')
  })

  it('mixes names and IDs for missing tasks', () => {
    const taskMap = new Map([['t1', 'Design']])
    const msg = formatCyclePath(['t1', 't2', 't1'], taskMap)
    expect(msg).toBe('Circular dependency detected: "Design" (t1) → t2 → "Design" (t1)')
  })

  it('handles empty cycle path gracefully', () => {
    const msg = formatCyclePath([])
    expect(msg).toBe('Circular dependency detected: ')
  })
})
