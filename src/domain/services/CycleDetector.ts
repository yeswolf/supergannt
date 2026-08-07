import type { Dependency } from '../entities/Dependency'

/**
 * One detected cycle in the dependency graph.
 * `taskPath` is the ordered list of task IDs forming the loop
 * (last task depends on first, closing the cycle).
 * `dependencyIds` are the Dependency IDs along the cycle edges.
 */
export interface CycleInfo {
  taskPath: string[]
  dependencyIds: string[]
}

/**
 * Narrow result from {@link wouldCreateCycle}: only the task path is available
 * because the quick-reachability DFS does not track dependency IDs.
 */
export interface CyclePath {
  taskPath: string[]
}

/**
 * Detects all cycles in a directed dependency graph using recursive DFS
 * with three-color marking (white = unvisited, gray = in current path, black = done).
 */
export function detectCycles(
  dependencies: readonly Dependency[],
): CycleInfo[] {
  const adj = new Map<string, { successorId: string; depId: string }[]>()
  const allNodes = new Set<string>()

  for (const d of dependencies) {
    allNodes.add(d.predecessorId)
    allNodes.add(d.successorId)
    const list = adj.get(d.predecessorId) ?? []
    list.push({ successorId: d.successorId, depId: d.id })
    adj.set(d.predecessorId, list)
  }

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  for (const id of allNodes) color.set(id, WHITE)

  // Track (node, edge depId) in the current DFS path to reconstruct cycles.
  let path: { node: string; edgeDepId: string | null }[] = []
  const cycles: CycleInfo[] = []

  function dfs(node: string, incomingDepId: string | null) {
    color.set(node, GRAY)
    path.push({ node, edgeDepId: incomingDepId })

    for (const edge of adj.get(node) ?? []) {
      const c = color.get(edge.successorId)
      if (c === GRAY) {
        // Found a back edge — extract the cycle from the path.
        const cycleStartIdx = path.findIndex(
          (p) => p.node === edge.successorId,
        )
        if (cycleStartIdx === -1) continue
        const cyclePath = path
          .slice(cycleStartIdx)
          .map((p) => p.node)
        cyclePath.push(edge.successorId) // close the loop
        const depIds = path
          .slice(cycleStartIdx)
          .map((p) => p.edgeDepId)
          .filter((id): id is string => id !== null)
        depIds.push(edge.depId)
        cycles.push({ taskPath: cyclePath, dependencyIds: depIds })
      } else if (c === WHITE) {
        dfs(edge.successorId, edge.depId)
      }
      // BLACK nodes are already fully processed — skip.
    }

    path.pop()
    color.set(node, BLACK)
  }

  // Start DFS from every white node.
  for (const node of allNodes) {
    if (color.get(node) === WHITE) {
      dfs(node, null)
    }
  }

  return cycles
}

/**
 * Tests whether adding a hypothetical edge (pred → succ) would close a cycle.
 * Returns the cycle that would be created, or null if the edge is safe.
 */
export function wouldCreateCycle(
  dependencies: readonly Dependency[],
  predecessorId: string,
  successorId: string,
): CyclePath | null {
  // Build adjacency from existing edges + the candidate.
  const adj = new Map<string, string[]>()
  for (const d of dependencies) {
    const list = adj.get(d.predecessorId) ?? []
    list.push(d.successorId)
    adj.set(d.predecessorId, list)
  }
  // Add the candidate edge.
  const list = adj.get(predecessorId) ?? []
  list.push(successorId)
  adj.set(predecessorId, list)

  // Quick check: DFS from successorId — if we can reach predecessorId, cycle exists.
  const visited = new Set<string>()
  const parent = new Map<string, string>() // for path reconstruction

  function dfsReachable(from: string, target: string): boolean {
    if (from === target) return true
    visited.add(from)
    for (const next of adj.get(from) ?? []) {
      if (visited.has(next)) continue
      parent.set(next, from)
      if (dfsReachable(next, target)) return true
    }
    return false
  }

  if (!dfsReachable(successorId, predecessorId)) return null

  // Reconstruct the cycle path: predecessorId → successorId → ... → predecessorId
  if (predecessorId === successorId) return { taskPath: [predecessorId, successorId] }

  const taskPath: string[] = [predecessorId, successorId]
  const middle: string[] = []
  let cur = predecessorId
  while (cur !== successorId) {
    const p = parent.get(cur)
    if (!p || p === cur) break
    middle.push(p)
    cur = p
  }
  // middle is the parent chain from pred back to succ, in reverse order.
  // Reverse to get forward order and drop the terminal successorId.
  middle.reverse()
  taskPath.push(...middle.slice(1))
  taskPath.push(predecessorId) // close the loop

  return { taskPath }
}
