import type { Dependency } from '../entities/Dependency'

export interface CircularDependencyResult {
  /** Whether a cycle was found. */
  readonly hasCycle: boolean
  /** The ordered cycle path (task IDs) from the first repeated node back to itself. */
  readonly cyclePath: readonly string[]
}

/**
 * Detect circular dependencies in a set of task dependencies using DFS.
 * Returns the first cycle found, or an empty result.
 */
export function detectCircularDependencies(
  dependencies: readonly Dependency[],
): CircularDependencyResult {
  // Build adjacency list: predecessorId -> successorId[]
  const adj = new Map<string, string[]>()
  const allNodes = new Set<string>()

  for (const dep of dependencies) {
    allNodes.add(dep.predecessorId)
    allNodes.add(dep.successorId)
    const neighbors = adj.get(dep.predecessorId)
    if (neighbors) {
      neighbors.push(dep.successorId)
    } else {
      adj.set(dep.predecessorId, [dep.successorId])
    }
  }

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  const parent = new Map<string, string>()

  for (const node of allNodes) {
    color.set(node, WHITE)
  }

  function dfs(node: string): string[] | null {
    color.set(node, GRAY)
    const neighbors = adj.get(node) ?? []
    for (const neighbor of neighbors) {
      if (color.get(neighbor) === GRAY) {
        // Found a cycle — reconstruct path from neighbor back to neighbor via parent
        const cycle: string[] = [neighbor]
        let cur = node
        while (cur !== neighbor) {
          cycle.push(cur)
          cur = parent.get(cur)!
        }
        cycle.push(neighbor)
        cycle.reverse()
        return cycle
      }
      if (color.get(neighbor) === WHITE) {
        parent.set(neighbor, node)
        const result = dfs(neighbor)
        if (result) return result
      }
    }
    color.set(node, BLACK)
    return null
  }

  for (const node of allNodes) {
    if (color.get(node) === WHITE) {
      const cycle = dfs(node)
      if (cycle) {
        return { hasCycle: true, cyclePath: cycle }
      }
    }
  }

  return { hasCycle: false, cyclePath: [] }
}

/**
 * Check whether adding a new dependency would create a circular dependency.
 * Returns the cycle path if it would, or null.
 */
export function wouldCreateCycle(
  existingDeps: readonly Dependency[],
  newPredecessorId: string,
  newSuccessorId: string,
): CircularDependencyResult {
  if (newPredecessorId === newSuccessorId) {
    return { hasCycle: true, cyclePath: [newPredecessorId, newSuccessorId] }
  }

  // Simulate adding the edge, checking for a cycle that includes the new edge
  const adj = new Map<string, string[]>()
  const allNodes = new Set<string>()

  for (const dep of existingDeps) {
    allNodes.add(dep.predecessorId)
    allNodes.add(dep.successorId)
    const neighbors = adj.get(dep.predecessorId)
    if (neighbors) {
      neighbors.push(dep.successorId)
    } else {
      adj.set(dep.predecessorId, [dep.successorId])
    }
  }

  allNodes.add(newPredecessorId)
  allNodes.add(newSuccessorId)
  const neighbors = adj.get(newPredecessorId)
  if (neighbors) {
    neighbors.push(newSuccessorId)
  } else {
    adj.set(newPredecessorId, [newSuccessorId])
  }

  // Check if there's a path from newSuccessorId back to newPredecessorId
  // using targeted DFS with 3-color marking for correct parent-path reconstruction.
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  const parent = new Map<string, string>()

  for (const node of allNodes) {
    color.set(node, WHITE)
  }

  // Parent of newSuccessorId is the new edge's predecessor so the reconstructed
  // cycle correctly starts from newPredecessorId.
  parent.set(newSuccessorId, newPredecessorId)

  function dfsFind(node: string): string[] | null {
    color.set(node, GRAY)
    for (const neighbor of adj.get(node) ?? []) {
      if (neighbor === newPredecessorId) {
        // Found a path back — reconstruct from neighbor via parent
        const cycle: string[] = [newPredecessorId]
        let cur = node
        while (cur !== newPredecessorId) {
          cycle.push(cur)
          cur = parent.get(cur)!
        }
        cycle.push(newPredecessorId)
        cycle.reverse()
        return cycle
      }
      if (color.get(neighbor) === WHITE) {
        parent.set(neighbor, node)
        const result = dfsFind(neighbor)
        if (result) return result
      }
    }
    color.set(node, BLACK)
    return null
  }

  const cycle = dfsFind(newSuccessorId)
  if (cycle) {
    return { hasCycle: true, cyclePath: cycle }
  }

  return { hasCycle: false, cyclePath: [] }
}

/**
 * Format a cycle path into a human-readable error message.
 */
export function formatCyclePath(
  cyclePath: readonly string[],
  tasks?: ReadonlyMap<string, string>,
): string {
  const names = cyclePath.map((id) => {
    const name = tasks?.get(id)
    return name ? `"${name}" (${id})` : id
  })
  return `Circular dependency detected: ${names.join(' → ')}`
}
