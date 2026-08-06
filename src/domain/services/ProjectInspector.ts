import type { Dependency, LinkType } from '../entities/Dependency'
import type { Task } from '../entities/Task'
import type { TaskId } from '../value-objects/Ids'

/** A single inspection finding. */
export interface InspectionFinding {
  /** Unique key for dedup in UI. */
  key: string
  severity: 'error' | 'warning' | 'info'
  category:
    | 'circular-dependency'
    | 'dangling-dependency'
    | 'duplicate-dependency'
    | 'self-dependency'
  message: string
  /** For circular deps: the cycle path as task id → task id → … → task id. */
  cyclePath?: TaskId[]
  /** For circular deps: human-readable cycle (task names with link type between). */
  cyclePathLabel?: string
}

interface StackFrame {
  taskId: TaskId
  edgeIndex: number
}

/**
 * Find all cycles in the dependency graph using iterative DFS.
 * Returns a map from dependency ID to all cycle paths it participates in.
 */
function findCyclicDependencyIds(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
): Map<string, string[][]> {
  const outgoing = new Map<
    TaskId,
    { successorId: TaskId; dependencyId: string; type: LinkType }[]
  >()

  for (const dep of dependencies) {
    const outs = outgoing.get(dep.predecessorId) ?? []
    outs.push({
      successorId: dep.successorId,
      dependencyId: dep.id,
      type: dep.type,
    })
    outgoing.set(dep.predecessorId, outs)
  }

  const taskIds = new Set(tasks.map((t) => t.id))
  const allCycles = new Map<string, string[][]>()

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<TaskId, number>()
  for (const id of taskIds) {
    color.set(id, WHITE)
  }

  function recordCyclePath(
    path: StackFrame[],
    cycleStart: TaskId,
  ): { taskIds: TaskId[]; depIds: string[] } {
    let startIdx = 0
    for (let i = 0; i < path.length; i++) {
      if (path[i]!.taskId === cycleStart) {
        startIdx = i
        break
      }
    }
    const cycleTaskIds: TaskId[] = []
    for (let i = startIdx; i < path.length; i++) {
      cycleTaskIds.push(path[i]!.taskId)
    }
    cycleTaskIds.push(cycleStart)

    const depIds: string[] = []
    for (let i = startIdx; i < path.length; i++) {
      const edges = outgoing.get(path[i]!.taskId) ?? []
      const nextTaskId =
        i + 1 < path.length ? path[i + 1]!.taskId : cycleStart
      const edge = edges.find((e) => e.successorId === nextTaskId)
      if (edge) depIds.push(edge.dependencyId)
    }
    return { taskIds: cycleTaskIds, depIds }
  }

  for (const startTaskId of taskIds) {
    if (color.get(startTaskId) !== WHITE) continue

    const stack: StackFrame[] = [{ taskId: startTaskId, edgeIndex: 0 }]
    color.set(startTaskId, GRAY)

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      const edges = outgoing.get(frame.taskId) ?? []

      if (frame.edgeIndex >= edges.length) {
        color.set(frame.taskId, BLACK)
        stack.pop()
        continue
      }

      const edge = edges[frame.edgeIndex]!
      frame.edgeIndex++

      if (!taskIds.has(edge.successorId)) continue

      const succColor = color.get(edge.successorId) ?? WHITE

      if (succColor === GRAY) {
        const cycleStack = [
          ...stack,
          { taskId: edge.successorId, edgeIndex: 0 },
        ]
        const { taskIds: cycleTasks, depIds } = recordCyclePath(
          cycleStack,
          edge.successorId,
        )

        for (const depId of depIds) {
          const existing = allCycles.get(depId)
          if (existing) {
            existing.push(cycleTasks)
          } else {
            allCycles.set(depId, [cycleTasks])
          }
        }
        continue
      }

      if (succColor === BLACK) continue

      color.set(edge.successorId, GRAY)
      stack.push({ taskId: edge.successorId, edgeIndex: 0 })
    }
  }

  return allCycles
}

function taskName(tasks: readonly Task[], id: TaskId): string {
  const task = tasks.find((t) => t.id === id)
  return task ? `"${task.name}" (${id})` : id
}

/**
 * Build a human-readable cycle path label from a cycle's task IDs and dependencies.
 */
function buildCyclePathLabel(
  cycleTaskIds: TaskId[],
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
): string {
  const parts: string[] = []
  for (let i = 0; i < cycleTaskIds.length; i++) {
    parts.push(taskName(tasks, cycleTaskIds[i]))
    if (i < cycleTaskIds.length - 1) {
      const next = cycleTaskIds[i + 1]!
      const dep = dependencies.find(
        (d) =>
          d.predecessorId === cycleTaskIds[i] && d.successorId === next,
      )
      if (dep) {
        parts.push(`→[${dep.type}]→`)
      } else {
        parts.push('→')
      }
    }
  }
  return parts.join(' ')
}

/**
 * Runs all inspections on a project and returns findings.
 * Called after every project mutation — lightweight enough to run on each edit.
 */
export function inspectProject(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
): InspectionFinding[] {
  const findings: InspectionFinding[] = []
  const taskIdSet = new Set(tasks.map((t) => t.id))
  let counter = 0

  // --- 1. Circular dependency detection ---
  const cycles = findCyclicDependencyIds(tasks, dependencies)
  const reportedCycles = new Set<string>()

  for (const [, paths] of cycles) {
    for (const pathTaskIds of paths) {
      const canonical = [...pathTaskIds].sort().join(',')
      if (reportedCycles.has(canonical)) continue
      reportedCycles.add(canonical)

      const cyclePathLabel = buildCyclePathLabel(
        pathTaskIds,
        tasks,
        dependencies,
      )
      findings.push({
        key: `circular-${counter++}`,
        severity: 'error',
        category: 'circular-dependency',
        message: `Circular dependency detected: ${cyclePathLabel}`,
        cyclePath: pathTaskIds,
        cyclePathLabel,
      })
    }
  }

  // --- 2. Dangling dependency references ---
  for (const dep of dependencies) {
    if (!taskIdSet.has(dep.predecessorId)) {
      findings.push({
        key: `dangling-pred-${dep.id}`,
        severity: 'error',
        category: 'dangling-dependency',
        message: `Dependency "${dep.id}": predecessor task "${dep.predecessorId}" does not exist`,
      })
    }
    if (!taskIdSet.has(dep.successorId)) {
      findings.push({
        key: `dangling-succ-${dep.id}`,
        severity: 'error',
        category: 'dangling-dependency',
        message: `Dependency "${dep.id}": successor task "${dep.successorId}" does not exist`,
      })
    }
  }

  // --- 3. Duplicate dependencies ---
  const pairCounts = new Map<string, Dependency[]>()
  for (const dep of dependencies) {
    const pairKey = `${dep.predecessorId}→${dep.successorId}`
    const list = pairCounts.get(pairKey) ?? []
    list.push(dep)
    pairCounts.set(pairKey, list)
  }
  for (const [, dups] of pairCounts) {
    if (dups.length > 1) {
      const predName = taskName(tasks, dups[0]!.predecessorId)
      const succName = taskName(tasks, dups[0]!.successorId)
      findings.push({
        key: `dup-${dups[0]!.id}`,
        severity: 'warning',
        category: 'duplicate-dependency',
        message: `Duplicate dependencies from ${predName} to ${succName} (${dups.length} links)`,
      })
    }
  }

  // --- 4. Self-dependency check ---
  for (const dep of dependencies) {
    if (dep.predecessorId === dep.successorId) {
      findings.push({
        key: `self-${dep.id}`,
        severity: 'error',
        category: 'self-dependency',
        message: `Task "${dep.predecessorId}" depends on itself`,
      })
    }
  }

  // Sort: errors first, then warnings, then info
  findings.sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 }
    return order[a.severity] - order[b.severity]
  })

  return findings
}
