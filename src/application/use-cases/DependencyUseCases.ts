import { Dependency } from '../../domain/entities/Dependency'
import { Duration } from '../../domain/value-objects/Duration'
import { asDependencyId, asTaskId } from '../../domain/value-objects/Ids'
import type { LinkType } from '../../domain/entities/Dependency'
import type { Project } from '../../domain/entities/Project'
import type { IdGenerator } from '../ports/IdGenerator'
import { refreshProject } from '../services/ProjectRefresh'
import { parsePredecessorsField } from '../services/PredecessorNotation'
import { wouldCreateCycle } from '../../domain/services/CycleDetector'

/**
 * After a predecessor is added/changed, let the link drive the successor bar
 * (ProjectLibre ASAP). Soft pins (SNET/SNLT/FNET/FNLT/ALAP) can otherwise keep
 * the successor stuck on its old dates — e.g. SNLT at current start blocks FS
 * push-out. Hard locks (MSO/MFO) are kept.
 */
function withLinkDrivenSuccessor(
  project: Project,
  successorId: string,
): Project {
  const tasks = project.tasks.map((task) => {
    if (task.id !== successorId) return task
    if (
      task.constraintType === 'mustStartOn' ||
      task.constraintType === 'mustFinishOn'
    ) {
      return task
    }
    if (
      task.constraintType === 'asSoonAsPossible' &&
      task.constraintDate == null
    ) {
      return task
    }
    return task.with({
      constraintType: 'asSoonAsPossible',
      constraintDate: null,
    })
  })
  return project.with({ tasks })
}

/** Stable signature so Task Info OK can rewrite the same predecessors without wiping SNET. */
function predecessorLinksSignature(
  links: readonly { predecessorId: string; type: LinkType; lagHours: number }[],
): string {
  return [...links]
    .map((l) => `${l.predecessorId}|${l.type}|${l.lagHours}`)
    .sort()
    .join(';')
}

function predecessorLinksChanged(
  project: Project,
  successorId: string,
  nextLinks: readonly { predecessorId: string; type: LinkType; lagHours: number }[],
): boolean {
  const current = project.dependencies
    .filter((d) => d.successorId === successorId)
    .map((d) => ({
      predecessorId: d.predecessorId,
      type: d.type,
      lagHours: d.lag.toHours(),
    }))
  return (
    predecessorLinksSignature(current) !== predecessorLinksSignature(nextLinks)
  )
}

export function linkTasks(
  project: Project,
  ids: IdGenerator,
  predecessorId: string,
  successorId: string,
  type: LinkType = 'FS',
  lagHours = 0,
): Project {
  if (predecessorId === successorId) {
    throw new Error('Cannot link a task to itself')
  }
  const withoutDup = project.dependencies.filter(
    (d) => !(d.predecessorId === predecessorId && d.successorId === successorId),
  )
  const cycle = wouldCreateCycle(withoutDup, predecessorId, successorId)
  if (cycle) {
    const path = cycle.taskPath
      .map((id) => project.getTask(id)?.name ?? id)
      .join(' → ')
    throw new Error(`Cannot link: would create circular dependency: ${path}`)
  }
  const dependency = Dependency.create({
    id: asDependencyId(ids.dependencyId()),
    predecessorId: asTaskId(predecessorId),
    successorId: asTaskId(successorId),
    type,
    lag: Duration.hours(lagHours),
  })

  return refreshProject(
    withLinkDrivenSuccessor(
      project.with({ dependencies: [...withoutDup, dependency] }),
      successorId,
    ).markDirty(),
  )
}

/** ProjectLibre Link button: chain selected tasks in order with FS. */
export function linkTaskChain(
  project: Project,
  ids: IdGenerator,
  taskIds: readonly string[],
): Project {
  if (taskIds.length < 2) {
    throw new Error('Select at least two tasks to link')
  }
  let next = project
  for (let i = 0; i < taskIds.length - 1; i += 1) {
    next = linkTasks(next, ids, taskIds[i]!, taskIds[i + 1]!, 'FS', 0)
  }
  return next
}

/** Remove all predecessors of the selected tasks (ProjectLibre Unlink). */
export function unlinkTasks(project: Project, taskIds: readonly string[]): Project {
  if (taskIds.length === 0) return project
  const set = new Set(taskIds)
  const dependencies = project.dependencies.filter((d) => !set.has(d.successorId))
  return refreshProject(project.with({ dependencies }).markDirty())
}

export function unlinkDependency(project: Project, dependencyId: string): Project {
  if (!project.dependencies.some((d) => d.id === dependencyId)) {
    return project
  }
  const dependencies = project.dependencies.filter((d) => d.id !== dependencyId)
  return refreshProject(project.with({ dependencies }).markDirty())
}

export function updateDependency(
  project: Project,
  dependencyId: string,
  patch: Partial<{ type: LinkType; lagHours: number; lagDays: number }>,
): Project {
  const lagHours =
    patch.lagHours !== undefined
      ? patch.lagHours
      : patch.lagDays !== undefined
        ? patch.lagDays * 8
        : undefined
  const dependencies = project.dependencies.map((d) => {
    if (d.id !== dependencyId) return d
    return d.with({
      type: patch.type ?? d.type,
      lag: lagHours !== undefined ? Duration.hours(lagHours) : d.lag,
    })
  })
  const updated = dependencies.find((d) => d.id === dependencyId)
  const base = project.with({ dependencies })
  const next = updated
    ? withLinkDrivenSuccessor(base, updated.successorId)
    : base
  return refreshProject(next.markDirty())
}

/**
 * Replace all predecessors of a successor from ProjectLibre-style notation
 * e.g. "2FS+8h, 1SS".
 */
export function setPredecessorsFromNotation(
  project: Project,
  ids: IdGenerator,
  successorId: string,
  notation: string,
): Project {
  const parsed = parsePredecessorsField(notation, project.tasks)
  for (const p of parsed) {
    if (p.taskId === successorId) {
      throw new Error('A task cannot depend on itself')
    }
  }
  const nextLinks = parsed.map((p) => ({
    predecessorId: p.taskId,
    type: p.type,
    lagHours: p.lagHours,
  }))
  const driveSuccessor = predecessorLinksChanged(project, successorId, nextLinks)
  const kept = project.dependencies.filter((d) => d.successorId !== successorId)
  // Check each new link for cycles.
  for (const p of parsed) {
    const cycle = wouldCreateCycle(kept, p.taskId, successorId)
    if (cycle) {
      const path = cycle.taskPath
        .map((id) => project.getTask(id)?.name ?? id)
        .join(' → ')
      throw new Error(
        `Cannot set predecessor: would create circular dependency: ${path}`,
      )
    }
  }
  const created = parsed.map((p) =>
    Dependency.create({
      id: asDependencyId(ids.dependencyId()),
      predecessorId: asTaskId(p.taskId),
      successorId: asTaskId(successorId),
      type: p.type,
      lag: Duration.hours(p.lagHours),
    }),
  )
  let next = project.with({ dependencies: [...kept, ...created] })
  if (driveSuccessor && created.length > 0) {
    next = withLinkDrivenSuccessor(next, successorId)
  }
  return refreshProject(next.markDirty())
}

export function setPredecessorLinks(
  project: Project,
  ids: IdGenerator,
  successorId: string,
  links: readonly { predecessorId: string; type: LinkType; lagHours: number }[],
): Project {
  const cleaned = links.filter((p) => p.predecessorId)
  const driveSuccessor = predecessorLinksChanged(project, successorId, cleaned)
  const kept = project.dependencies.filter((d) => d.successorId !== successorId)
  // Check each new link for cycles.
  for (const p of cleaned) {
    if (p.predecessorId === successorId) {
      throw new Error('A task cannot depend on itself')
    }
    const cycle = wouldCreateCycle(kept, p.predecessorId, successorId)
    if (cycle) {
      const path = cycle.taskPath
        .map((id) => project.getTask(id)?.name ?? id)
        .join(' → ')
      throw new Error(
        `Cannot set predecessor: would create circular dependency: ${path}`,
      )
    }
  }
  const created = cleaned.map((p) => {
    return Dependency.create({
      id: asDependencyId(ids.dependencyId()),
      predecessorId: asTaskId(p.predecessorId),
      successorId: asTaskId(successorId),
      type: p.type,
      lag: Duration.hours(p.lagHours),
    })
  })
  let next = project.with({ dependencies: [...kept, ...created] })
  // Only clear soft pins when the predecessor set actually changes — Task Info OK
  // rewrites the same rows and must not undo a Start-driven SNET move.
  if (driveSuccessor && created.length > 0) {
    next = withLinkDrivenSuccessor(next, successorId)
  }
  return refreshProject(next.markDirty())
}
