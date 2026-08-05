import type { Dependency } from '../entities/Dependency'
import type { Task } from '../entities/Task'
import type { TaskId } from '../value-objects/Ids'

/** A single detected cycle with the full path showing the circular chain. */
export interface CircularDependencyCycle {
  /** The task IDs that form the cycle, starting and ending with the same ID. */
  path: TaskId[]
  /** The dependency IDs along each edge of the cycle. */
  dependencyIds: string[]
  /** Human-readable description of the cycle using task names. */
  description: string
}

/** Result of a circular dependency analysis. */
export interface CircularDependencyReport {
  /** True when no cycles exist. */
  acyclic: boolean
  /** Every detected cycle, sorted shortest-first. */
  cycles: CircularDependencyCycle[]
  /** Summary message suitable for display in an error pane. */
  summary: string
}

/** A task that has no predecessors and no successors. */
export interface OrphanTask {
  taskId: TaskId
  taskName: string
  reason: 'noPredecessors' | 'noSuccessors' | 'isolated'
}

/** A redundant dependency: B already depends on A transitively, so a direct A→B link is redundant. */
export interface RedundantDependency {
  dependencyId: string
  predecessorId: TaskId
  successorId: TaskId
  /** The existing transitive path that makes this edge redundant. */
  transitivePath: TaskId[]
}

/** Extended inspection report with extra useful diagnostics. */
export interface InspectionReport extends CircularDependencyReport {
  orphanTasks: OrphanTask[]
  redundantDependencies: RedundantDependency[]
  /** Tasks that appear as predecessors/successors but don't exist in the task list. */
  danglingReferences: DanglingReference[]
}

export interface DanglingReference {
  dependencyId: string
  missingTaskId: TaskId
  role: 'predecessor' | 'successor'
}

/**
 * Detects circular dependencies, orphan tasks, redundant edges, and dangling references
 * in a project's dependency graph.
 *
 * All traversals are O(V + E) where V = tasks, E = dependencies.
 */
export function inspectDependencies(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
): InspectionReport {
  const taskIds = new Set(tasks.map((t) => t.id))
  const taskNames = new Map(tasks.map((t) => [t.id, t.name]))

  const cycles = detectCycles(taskIds, dependencies, taskNames)
  const orphanTasks = detectOrphanTasks(tasks, dependencies)
  const redundantDeps = detectRedundantDependencies(taskIds, dependencies)
  const danglingRefs = detectDanglingReferences(taskIds, dependencies)

  const summary = buildSummary(cycles, orphanTasks, redundantDeps, danglingRefs)

  return {
    acyclic: cycles.length === 0,
    cycles,
    summary,
    orphanTasks,
    redundantDependencies: redundantDeps,
    danglingReferences: danglingRefs,
  }
}

// ─── Cycle detection ────────────────────────────────────────────────────────

function detectCycles(
  taskIds: Set<TaskId>,
  dependencies: readonly Dependency[],
  taskNames: Map<TaskId, string>,
): CircularDependencyCycle[] {
  // Build adjacency: predecessorId → successorId, dependencyId }]
  const adj = new Map<TaskId, { successorId: TaskId; dependencyId: string }[]>()
  for (const dep of dependencies) {
    if (!taskIds.has(dep.predecessorId) || !taskIds.has(dep.successorId)) {
      continue // dangling — handled separately
    }
    const list = adj.get(dep.predecessorId) ?? []
    list.push({ successorId: dep.successorId, dependencyId: dep.id })
    adj.set(dep.predecessorId, list)
  }

  const cycles: CircularDependencyCycle[] = []
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<TaskId, number>()
  const parent = new Map<TaskId, { predecessorId: TaskId; dependencyId: string }>()

  for (const taskId of taskIds) {
    color.set(taskId, WHITE)
  }

  // Iterative DFS to avoid stack overflow on large projects and to build
  // readable cycle paths.
  for (const startId of taskIds) {
    if (color.get(startId) !== WHITE) continue

    // Stack entries: [taskId, phase]
    // phase 0 = enter (pre-order), phase 1 = exit (post-order)
    const stack: Array<[TaskId, number]> = [[startId, 0]]

    while (stack.length > 0) {
      const [taskId, phase] = stack.pop()!

      if (phase === 0) {
        if (color.get(taskId) === BLACK) continue
        color.set(taskId, GRAY)
        stack.push([taskId, 1]) // post-order marker

        for (const { successorId, dependencyId } of adj.get(taskId) ?? []) {
          const succColor = color.get(successorId) ?? WHITE
          if (succColor === GRAY) {
            // Found a back-edge: reconstruct the cycle path
            const cycle = reconstructCycle(
              taskId,
              successorId,
              dependencyId,
              parent,
              taskNames,
            )
            cycles.push(cycle)
          } else if (succColor === WHITE) {
            parent.set(successorId, { predecessorId: taskId, dependencyId })
            stack.push([successorId, 0])
          }
          // BLACK — cross/tree edge, skip
        }
      } else {
        color.set(taskId, BLACK)
      }
    }
  }

  // Remove duplicates (same cycle may be found from different start nodes)
  // and sort shortest-first.
  return deduplicateAndSortCycles(cycles)
}

function reconstructCycle(
  fromId: TaskId,
  toId: TaskId,
  closingDepId: string,
  parent: Map<TaskId, { predecessorId: TaskId; dependencyId: string }>,
  taskNames: Map<TaskId, string>,
): CircularDependencyCycle {
  // Walk backward from `fromId` to `toId` through the parent chain,
  // then add the closing edge back to `toId`.
  const path: TaskId[] = [toId]
  const depIds: string[] = []

  // Walk from fromId up to toId
  let current = fromId
  const reversePath: TaskId[] = []
  const reverseDeps: string[] = []
  while (current !== toId) {
    reversePath.push(current)
    const p = parent.get(current)
    if (!p) break // should not happen
    reverseDeps.push(p.dependencyId)
    current = p.predecessorId
  }

  // Build the full path: toId → (reverse of reversePath) → toId
  for (let i = reversePath.length - 1; i >= 0; i--) {
    path.push(reversePath[i]!)
    depIds.push(reverseDeps[i]!)
  }
  path.push(toId) // close the cycle
  depIds.push(closingDepId)

  const names = path.map((id) => taskNames.get(id) ?? String(id))
  const description = names.join(' → ') + ' → (back to start)'

  return { path, dependencyIds: depIds, description }
}

function deduplicateAndSortCycles(
  cycles: CircularDependencyCycle[],
): CircularDependencyCycle[] {
  const seen = new Set<string>()
  const unique: CircularDependencyCycle[] = []

  for (const cycle of cycles) {
    // Normalize: rotate so smallest ID is first, then stringify
    const normalized = normalizeCyclePath(cycle.path)
    const key = normalized.join(',')
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(cycle)
    }
  }

  unique.sort((a, b) => a.path.length - b.path.length)
  return unique
}

function normalizeCyclePath(path: TaskId[]): TaskId[] {
  if (path.length <= 1) return [...path]
  // Remove the trailing duplicate (cycle end = cycle start)
  const nodes = path.slice(0, -1)
  // Find the smallest element
  let minIdx = 0
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i] < nodes[minIdx]!) minIdx = i
  }
  // Rotate so smallest is first
  const rotated = [...nodes.slice(minIdx), ...nodes.slice(0, minIdx)]
  return [...rotated, rotated[0]]
}

// ─── Orphan detection ───────────────────────────────────────────────────────

function detectOrphanTasks(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
): OrphanTask[] {
  const preds = new Set(dependencies.map((d) => d.successorId))
  const succs = new Set(dependencies.map((d) => d.predecessorId))

  const orphans: OrphanTask[] = []
  for (const task of tasks) {
    const hasPred = preds.has(task.id)
    const hasSucc = succs.has(task.id)

    if (!hasPred && !hasSucc) {
      orphans.push({
        taskId: task.id,
        taskName: task.name,
        reason: 'isolated',
      })
    } else if (!hasPred && hasSucc) {
      orphans.push({
        taskId: task.id,
        taskName: task.name,
        reason: 'noPredecessors',
      })
    } else if (hasPred && !hasSucc) {
      orphans.push({
        taskId: task.id,
        taskName: task.name,
        reason: 'noSuccessors',
      })
    }
  }

  // Sort: isolated first, then alphabetically
  orphans.sort((a, b) => {
    const order = { isolated: 0, noPredecessors: 1, noSuccessors: 2 }
    const diff = (order[a.reason] ?? 3) - (order[b.reason] ?? 3)
    return diff !== 0 ? diff : a.taskName.localeCompare(b.taskName)
  })

  return orphans
}

// ─── Redundant dependency detection ─────────────────────────────────────────

function detectRedundantDependencies(
  taskIds: Set<TaskId>,
  dependencies: readonly Dependency[],
): RedundantDependency[] {
  // Floyd-Warshall transitive closure for small/medium graphs.
  // For each dependency A→B, check if there's already another path A→…→B.
  const ids = [...taskIds]
  const idx = new Map(ids.map((id, i) => [id, i]))
  const n = ids.length

  // reachable[i][j] = true if there's a path from ids[i] to ids[j]
  const reachable: boolean[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => false),
  )

  // Initialize with direct edges
  for (const dep of dependencies) {
    const i = idx.get(dep.predecessorId)
    const j = idx.get(dep.successorId)
    if (i !== undefined && j !== undefined) {
      reachable[i]![j] = true
    }
  }

  // Floyd-Warshall
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      if (!reachable[i]![k]) continue
      for (let j = 0; j < n; j++) {
        if (reachable[k]![j]) {
          reachable[i]![j] = true
        }
      }
    }
  }

  // Now find redundant edges: for each dependency A→B,
  // temporarily remove it and check if A still reaches B.
  const redundant: RedundantDependency[] = []

  for (const dep of dependencies) {
    const i = idx.get(dep.predecessorId)
    const j = idx.get(dep.successorId)
    if (i === undefined || j === undefined) continue

    // Check if there's an alternative path i→…→j using other edges
    let hasAlternativePath = false
    for (let k = 0; k < n && !hasAlternativePath; k++) {
      if (k === i || k === j) continue
      // Is there a direct edge i→k (other than via j) and k reaches j?
      const edgeFromIToK = dependencies.some(
        (d) =>
          d.predecessorId === ids[i] &&
          d.successorId === ids[k] &&
          d.id !== dep.id,
      )
      if (edgeFromIToK && reachable[k]![j]) {
        hasAlternativePath = true
        // Build the transitive path
        const transitivePath = findShortestPath(ids, dependencies, ids[i]!, ids[k]!, ids[j]!)
        if (transitivePath.length > 0) {
          redundant.push({
            dependencyId: dep.id,
            predecessorId: dep.predecessorId,
            successorId: dep.successorId,
            transitivePath,
          })
        }
      }
    }
  }

  return redundant
}

function findShortestPath(
  ids: TaskId[],
  dependencies: readonly Dependency[],
  from: TaskId,
  via: TaskId,
  to: TaskId,
): TaskId[] {
  // Build adjacency without the direct from→to edge
  const adj = new Map<TaskId, TaskId[]>()
  for (const dep of dependencies) {
    const list = adj.get(dep.predecessorId) ?? []
    list.push(dep.successorId)
    adj.set(dep.predecessorId, list)
  }

  // BFS from `via` to `to`
  const parent = new Map<TaskId, TaskId>()
  const queue: TaskId[] = [via]
  const visited = new Set<TaskId>([via])

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === to) {
      // Reconstruct path
      const path: TaskId[] = [from, via]
      let p = to
      const tail: TaskId[] = []
      while (p !== via) {
        tail.push(p)
        p = parent.get(p)!
      }
      return [...path, ...tail.reverse()]
    }
    for (const next of adj.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        parent.set(next, current)
        queue.push(next)
      }
    }
  }

  return []
}

// ─── Dangling reference detection ───────────────────────────────────────────

function detectDanglingReferences(
  taskIds: Set<TaskId>,
  dependencies: readonly Dependency[],
): DanglingReference[] {
  const dangling: DanglingReference[] = []

  for (const dep of dependencies) {
    if (!taskIds.has(dep.predecessorId)) {
      dangling.push({
        dependencyId: dep.id,
        missingTaskId: dep.predecessorId,
        role: 'predecessor',
      })
    }
    if (!taskIds.has(dep.successorId)) {
      dangling.push({
        dependencyId: dep.id,
        missingTaskId: dep.successorId,
        role: 'successor',
      })
    }
  }

  return dangling
}

// ─── Summary builder ────────────────────────────────────────────────────────

function buildSummary(
  cycles: CircularDependencyCycle[],
  orphans: OrphanTask[],
  redundant: RedundantDependency[],
  dangling: DanglingReference[],
): string {
  const parts: string[] = []

  if (cycles.length > 0) {
    parts.push(
      cycles.length === 1
        ? `1 circular dependency found`
        : `${cycles.length} circular dependencies found`,
    )
  } else {
    parts.push('No circular dependencies')
  }

  if (orphans.length > 0) {
    const isolated = orphans.filter((o) => o.reason === 'isolated').length
    const noPreds = orphans.filter((o) => o.reason === 'noPredecessors').length
    const noSuccs = orphans.filter((o) => o.reason === 'noSuccessors').length
    const orphanParts: string[] = []
    if (isolated > 0) orphanParts.push(`${isolated} isolated`)
    if (noPreds > 0) orphanParts.push(`${noPreds} without predecessors`)
    if (noSuccs > 0) orphanParts.push(`${noSuccs} without successors`)
    parts.push(`${orphans.length} orphan tasks (${orphanParts.join(', ')})`)
  }

  if (redundant.length > 0) {
    parts.push(`${redundant.length} redundant dependencies`)
  }

  if (dangling.length > 0) {
    parts.push(`${dangling.length} dangling references`)
  }

  return parts.join('. ') + '.'
}