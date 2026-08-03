import { Dependency } from '../../domain/entities/Dependency'
import { Duration } from '../../domain/value-objects/Duration'
import { asDependencyId, asTaskId } from '../../domain/value-objects/Ids'
import type { LinkType } from '../../domain/entities/Dependency'
import type { Project } from '../../domain/entities/Project'
import type { IdGenerator } from '../ports/IdGenerator'
import { refreshProject } from '../services/ProjectRefresh'
import { parsePredecessorsField } from '../services/PredecessorNotation'

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
  const kept = project.dependencies.filter((d) => d.successorId !== successorId)
  const created = parsed.map((p) =>
    Dependency.create({
      id: asDependencyId(ids.dependencyId()),
      predecessorId: asTaskId(p.taskId),
      successorId: asTaskId(successorId),
      type: p.type,
      lag: Duration.hours(p.lagHours),
    }),
  )
  const next =
    created.length > 0
      ? withLinkDrivenSuccessor(
          project.with({ dependencies: [...kept, ...created] }),
          successorId,
        )
      : project.with({ dependencies: [...kept, ...created] })
  return refreshProject(next.markDirty())
}

export function setPredecessorLinks(
  project: Project,
  ids: IdGenerator,
  successorId: string,
  links: readonly { predecessorId: string; type: LinkType; lagHours: number }[],
): Project {
  const kept = project.dependencies.filter((d) => d.successorId !== successorId)
  const cleaned = links.filter((p) => p.predecessorId)
  const created = cleaned.map((p) => {
    if (p.predecessorId === successorId) {
      throw new Error('A task cannot depend on itself')
    }
    return Dependency.create({
      id: asDependencyId(ids.dependencyId()),
      predecessorId: asTaskId(p.predecessorId),
      successorId: asTaskId(successorId),
      type: p.type,
      lag: Duration.hours(p.lagHours),
    })
  })
  const next =
    created.length > 0
      ? withLinkDrivenSuccessor(
          project.with({ dependencies: [...kept, ...created] }),
          successorId,
        )
      : project.with({ dependencies: [...kept, ...created] })
  return refreshProject(next.markDirty())
}
