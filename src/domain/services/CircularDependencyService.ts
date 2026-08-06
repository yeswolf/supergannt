import type { Dependency } from '../entities/Dependency'
import type { Task } from '../entities/Task'
import type { TaskId } from '../value-objects/Ids'

/** A single circular dependency path: [A, B, C, A] means A→B→C→A. */
export interface CircularPath {
  /** The task IDs forming the cycle, ending with a repeat of the first ID. */
  path: TaskId[]
  /** Human-readable path using task names. */
  description: string
}

/** A dependency referencing a task that does not exist in the project. */
export interface OrphanDependency {
  dependencyId: string
  missingTaskId: TaskId
  /** Whether the missing task is the predecessor or successor. */
  role: 'predecessor' | 'successor'
}

/** Two paths where one is fully covered by a chain of dependencies. */
export interface RedundantDependency {
  /** The direct dependency that is redundant. */
  dependencyId: string
  predecessorId: TaskId
  successorId: TaskId
  /** The intermediate chain that already connects them. */
  chainVia: TaskId[]
}

/**
 * Summary of all dependency inspections run against a project.
 */
export interface DependencyInspectionReport {
  /** Whether the dependency graph is acyclic (no cycles found). */
  isAcyclic: boolean
  /** All detected circular paths. */
  cycles: CircularPath[]
  /** Dependencies that reference missing tasks. */
  orphans: OrphanDependency[]
  /** Dependencies that are transitively redundant (A→C when A→B→C exists). */
  redundants: RedundantDependency[]
  /** Dependencies where predecessorId === successorId (already rejected at entity level, but checked for completeness). */
  selfRefs: string[]
}

/**
 * Find all cycles in the dependency graph using iterative DFS with coloring.
 *
 * Returns each cycle once (the first back-edge that closes it). The path
 * starts from some task, follows predecessors→successors, and ends with
 * the starting task repeated so the renderer can highlight the full loop.
 */
export function findCircularPaths(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
): CircularPath[] {
  const taskNames = new Map<TaskId, string>()
  for (const t of tasks) {
    taskNames.set(t.id, t.name)
  }

  // Build adjacency list: predecessorId → [successorId]
  const adj = new Map<TaskId, TaskId[]>()
  for (const d of dependencies) {
    const succs = adj.get(d.predecessorId) ?? []
    succs.push(d.successorId)
    adj.set(d.predecessorId, succs)
  }

  const cycles: CircularPath[] = []
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<TaskId, number>()
  const parent = new Map<TaskId, TaskId>()

  const allIds = new Set<TaskId>()
  for (const d of dependencies) {
    allIds.add(d.predecessorId)
    allIds.add(d.successorId)
  }

  function traceCycle(start: TaskId, end: TaskId): CircularPath {
    // start = frame.node (the node with the back edge), end = neighbor (GRAY node).
    // Walk backwards from start through the parent chain to end, then wrap.
    const path: TaskId[] = [end]
    const reversed: TaskId[] = []
    let current: TaskId | undefined = start
    while (current !== undefined && current !== end) {
      reversed.push(current)
      current = parent.get(current)
    }
    reversed.reverse()
    path.push(...reversed)
    path.push(end)
    const description = path
      .map((id) => taskNames.get(id) ?? id)
      .join(' → ')
    return { path, description }
  }

  for (const nodeId of allIds) {
    if (color.get(nodeId) !== undefined) continue
    color.set(nodeId, GRAY)
    const stack: { node: TaskId; nextIdx: number }[] = [
      { node: nodeId, nextIdx: 0 },
    ]
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      const neighbors = adj.get(frame.node) ?? []
      if (frame.nextIdx < neighbors.length) {
        const neighbor = neighbors[frame.nextIdx]!
        frame.nextIdx++
        const neighborColor = color.get(neighbor)
        if (neighborColor === GRAY) {
          cycles.push(traceCycle(frame.node, neighbor))
        } else if (neighborColor === undefined) {
          color.set(neighbor, GRAY)
          parent.set(neighbor, frame.node)
          stack.push({ node: neighbor, nextIdx: 0 })
        }
      } else {
        color.set(frame.node, BLACK)
        stack.pop()
      }
    }
  }

  return cycles
}

/**
 * Detect dependencies that reference tasks not present in the task list.
 */
export function findOrphanDependencies(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
): OrphanDependency[] {
  const taskIds = new Set(tasks.map((t) => t.id))
  const orphans: OrphanDependency[] = []
  for (const d of dependencies) {
    if (!taskIds.has(d.predecessorId)) {
      orphans.push({
        dependencyId: d.id,
        missingTaskId: d.predecessorId,
        role: 'predecessor',
      })
    }
    if (!taskIds.has(d.successorId)) {
      orphans.push({
        dependencyId: d.id,
        missingTaskId: d.successorId,
        role: 'successor',
      })
    }
  }
  return orphans
}

/**
 * Detect redundant dependencies: when A→C exists directly but A→B→C also
 * exists through a chain of dependencies. The direct link is redundant for
 * scheduling purposes.
 */
export function findRedundantDependencies(
  dependencies: readonly Dependency[],
): RedundantDependency[] {
  const adj = new Map<TaskId, { successorId: TaskId; depId: string }[]>()
  for (const d of dependencies) {
    const list = adj.get(d.predecessorId) ?? []
    list.push({ successorId: d.successorId, depId: d.id })
    adj.set(d.predecessorId, list)
  }

  const transitiveReach = new Map<TaskId, Map<TaskId, TaskId[]>>()
  for (const [node] of adj) {
    const reachable = new Map<TaskId, TaskId[]>()
    const queue: { current: TaskId; path: TaskId[] }[] = []
    const directSuccs = adj.get(node) ?? []
    for (const { successorId } of directSuccs) {
      queue.push({ current: successorId, path: [successorId] })
    }
    while (queue.length > 0) {
      const item = queue.shift()!
      if (reachable.has(item.current)) continue
      if (item.path.length >= 2) {
        reachable.set(item.current, item.path)
      }
      const next = adj.get(item.current) ?? []
      for (const { successorId } of next) {
        if (!reachable.has(successorId)) {
          queue.push({
            current: successorId,
            path: [...item.path, successorId],
          })
        }
      }
    }
    transitiveReach.set(node, reachable)
  }

  const redundants: RedundantDependency[] = []
  for (const d of dependencies) {
    const reachable = transitiveReach.get(d.predecessorId)
    if (!reachable) continue
    const chain = reachable.get(d.successorId)
    if (chain) {
      redundants.push({
        dependencyId: d.id,
        predecessorId: d.predecessorId,
        successorId: d.successorId,
        chainVia: chain.slice(0, -1),
      })
    }
  }

  return redundants
}

/**
 * Detect self-referencing dependencies (predecessorId === successorId).
 */
export function findSelfReferencingDependencies(
  dependencies: readonly Dependency[],
): string[] {
  return dependencies
    .filter((d) => d.predecessorId === d.successorId)
    .map((d) => d.id)
}

/**
 * Run all dependency inspections and return a consolidated report.
 */
export function inspectDependencies(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
): DependencyInspectionReport {
  const cycles = findCircularPaths(tasks, dependencies)
  return {
    isAcyclic: cycles.length === 0,
    cycles,
    orphans: findOrphanDependencies(tasks, dependencies),
    redundants: findRedundantDependencies(dependencies),
    selfRefs: findSelfReferencingDependencies(dependencies),
  }
}

/**
 * Check whether adding a new dependency (predecessorId → successorId) would
 * create a cycle. Returns the circular path if it would, or null if safe.
 */
export function wouldCreateCycle(
  tasks: readonly Task[],
  existingDeps: readonly Dependency[],
  predecessorId: TaskId,
  successorId: TaskId,
): CircularPath | null {
  if (predecessorId === successorId) {
    const taskNames = new Map<TaskId, string>()
    for (const t of tasks) {
      taskNames.set(t.id, t.name)
    }
    const name = taskNames.get(predecessorId) ?? predecessorId
    return {
      path: [predecessorId, successorId],
      description: `${name} → ${name} (self-reference)`,
    }
  }

  const adj = new Map<TaskId, TaskId[]>()
  for (const d of existingDeps) {
    const succs = adj.get(d.predecessorId) ?? []
    succs.push(d.successorId)
    adj.set(d.predecessorId, succs)
  }

  const visited = new Set<TaskId>()
  const parent = new Map<TaskId, TaskId>()
  const queue: TaskId[] = [successorId]
  visited.add(successorId)

  while (queue.length > 0) {
    const current = queue.shift()!
    const neighbors = adj.get(current) ?? []
    for (const neighbor of neighbors) {
      if (neighbor === predecessorId) {
        const taskNames = new Map<TaskId, string>()
        for (const t of tasks) {
          taskNames.set(t.id, t.name)
        }
        const path: TaskId[] = [neighbor]
        let cursor: TaskId | undefined = current
        while (cursor !== undefined && cursor !== successorId) {
          path.push(cursor)
          cursor = parent.get(cursor)
        }
        path.push(successorId)
        path.push(neighbor)
        const description = path
          .map((id) => taskNames.get(id) ?? id)
          .join(' → ')
        return { path, description }
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        parent.set(neighbor, current)
        queue.push(neighbor)
      }
    }
  }

  return null
}