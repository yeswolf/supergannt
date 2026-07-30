import { Resource } from '../../domain/entities/Resource'
import { Assignment } from '../../domain/entities/Assignment'
import { Money } from '../../domain/value-objects/Money'
import { Duration } from '../../domain/value-objects/Duration'
import {
  asAssignmentId,
  asResourceId,
  asTaskId,
} from '../../domain/value-objects/Ids'
import type { ResourceType } from '../../domain/entities/Resource'
import type { Project } from '../../domain/entities/Project'
import type { IdGenerator } from '../ports/IdGenerator'
import { refreshProject } from '../services/ProjectRefresh'
import {
  detectAssignmentChangeKind,
  recalculateForAssignmentChange,
  roundHours,
  totalAssignmentUnits,
} from '../../domain/services/EffortScheduling'

export function addResource(
  project: Project,
  ids: IdGenerator,
  input: { name?: string; type?: ResourceType; standardRate?: number } = {},
): Project {
  const resource = Resource.create({
    id: asResourceId(ids.resourceId()),
    name: input.name?.trim() || 'New Resource',
    type: input.type ?? 'work',
    email: '',
    group: '',
    maxUnits: 1,
    standardRate: Money.of(input.standardRate ?? 0, project.currency),
    overtimeRate: Money.zero(project.currency),
    costPerUse: Money.zero(project.currency),
    calendarId: project.calendarId,
    notes: '',
  })
  return project.with({ resources: [...project.resources, resource] }).markDirty()
}

export function updateResource(
  project: Project,
  resourceId: string,
  patch: Partial<{
    name: string
    type: ResourceType
    email: string
    group: string
    maxUnits: number
    standardRate: number
    notes: string
  }>,
): Project {
  const resources = project.resources.map((r) => {
    if (r.id !== resourceId) return r
    return r.with({
      name: patch.name ?? r.name,
      type: patch.type ?? r.type,
      email: patch.email ?? r.email,
      group: patch.group ?? r.group,
      maxUnits: patch.maxUnits ?? r.maxUnits,
      standardRate:
        patch.standardRate !== undefined
          ? Money.of(patch.standardRate, project.currency)
          : r.standardRate,
      notes: patch.notes ?? r.notes,
    })
  })
  return refreshProject(project.with({ resources }).markDirty())
}

export function deleteResource(project: Project, resourceId: string): Project {
  const resources = project.resources.filter((r) => r.id !== resourceId)
  const affectedTaskIds = new Set(
    project.assignments
      .filter((a) => a.resourceId === resourceId)
      .map((a) => a.taskId),
  )
  let next: Project = project.with({
    resources,
    assignments: project.assignments.filter((a) => a.resourceId !== resourceId),
  })
  for (const taskId of affectedTaskIds) {
    next = applyAssignmentRecalc(
      next,
      taskId,
      project.assignments.filter((a) => a.taskId === taskId),
      next.assignments.filter((a) => a.taskId === taskId),
      'membership',
    )
  }
  return refreshProject(next.markDirty())
}

export function assignResource(
  project: Project,
  ids: IdGenerator,
  taskId: string,
  resourceId: string,
  units = 1,
): Project {
  const previous = project.assignments.filter((a) => a.taskId === taskId)
  const existing = previous.find((a) => a.resourceId === resourceId)

  let nextAssignments: Assignment[]
  let kind: 'units' | 'membership'
  if (existing) {
    kind = 'units'
    nextAssignments = project.assignments.map((a) =>
      a.id === existing.id ? a.with({ units }) : a,
    )
  } else {
    kind = 'membership'
    const assignment = Assignment.create({
      id: asAssignmentId(ids.assignmentId()),
      taskId: asTaskId(taskId),
      resourceId: asResourceId(resourceId),
      units,
      workHours: 0,
      cost: Money.zero(project.currency),
    })
    nextAssignments = [...project.assignments, assignment]
  }

  const withAssignments = project.with({ assignments: nextAssignments })
  return refreshProject(
    applyAssignmentRecalc(
      withAssignments,
      taskId,
      previous,
      nextAssignments.filter((a) => a.taskId === taskId),
      kind,
    ).markDirty(),
  )
}

export function unassignResource(
  project: Project,
  assignmentId: string,
): Project {
  const removed = project.assignments.find((a) => a.id === assignmentId)
  if (!removed) return project
  const previous = project.assignments.filter((a) => a.taskId === removed.taskId)
  const nextAssignments = project.assignments.filter((a) => a.id !== assignmentId)
  const withAssignments = project.with({ assignments: nextAssignments })
  return refreshProject(
    applyAssignmentRecalc(
      withAssignments,
      removed.taskId,
      previous,
      nextAssignments.filter((a) => a.taskId === removed.taskId),
      'membership',
    ).markDirty(),
  )
}

/** Replace all resources on a task (ProjectLibre Resources tab / Resource Names column). */
export function setTaskAssignments(
  project: Project,
  ids: IdGenerator,
  taskId: string,
  links: readonly { resourceId: string; units: number }[],
): Project {
  const previous = project.assignments.filter((a) => a.taskId === taskId)
  const cleaned = links.filter((l) => l.resourceId)
  // Task Info OK re-saves the Resources tab even when untouched. Recreating
  // assignments + triangle recalc would overwrite a duration just set on General.
  const unchanged =
    cleaned.length === previous.length &&
    cleaned.every((link) =>
      previous.some(
        (a) =>
          a.resourceId === link.resourceId &&
          Math.abs(a.units - link.units) < 1e-9,
      ),
    ) &&
    previous.every((a) =>
      cleaned.some(
        (link) =>
          link.resourceId === a.resourceId &&
          Math.abs(link.units - a.units) < 1e-9,
      ),
    )
  if (unchanged) return project

  const kept = project.assignments.filter((a) => a.taskId !== taskId)
  const created = cleaned.map((link) =>
    Assignment.create({
      id: asAssignmentId(ids.assignmentId()),
      taskId: asTaskId(taskId),
      resourceId: asResourceId(link.resourceId),
      units: link.units,
      workHours: 0,
      cost: Money.zero(project.currency),
    }),
  )
  const kind = detectAssignmentChangeKind(previous, created)
  const nextAssignments = [...kept, ...created]
  const withAssignments = project.with({ assignments: nextAssignments })
  return refreshProject(
    applyAssignmentRecalc(
      withAssignments,
      taskId,
      previous,
      created,
      kind,
    ).markDirty(),
  )
}

export function formatTaskResourceNames(
  project: Project,
  taskId: string,
): string {
  return project.assignments
    .filter((a) => a.taskId === taskId)
    .map((a) => {
      const resource = project.resources.find((r) => r.id === a.resourceId)
      if (!resource) return null
      return a.units === 1 ? resource.name : `${resource.name}[${a.units}]`
    })
    .filter(Boolean)
    .join(', ')
}

/**
 * Apply ProjectLibre triangle rules to the task after its assignment set changes.
 */
function applyAssignmentRecalc(
  project: Project,
  taskId: string,
  previous: readonly Assignment[],
  nextForTask: readonly Assignment[],
  kind: 'units' | 'membership',
): Project {
  const task = project.tasks.find((t) => t.id === taskId)
  if (!task || task.summary || task.milestone) {
    return project
  }

  const result = recalculateForAssignmentChange({
    schedulingType: task.schedulingType,
    effortDriven: task.effortDriven,
    durationHours: task.duration.toHours(),
    workHours: task.workHours,
    previous: previous.map((a) => ({ units: a.units, workHours: a.workHours })),
    next: nextForTask.map((a) => ({ units: a.units, workHours: a.workHours })),
    kind,
  })

  const unitsForStamp =
    result.nextUnits && result.nextUnits.length === nextForTask.length
      ? result.nextUnits
      : nextForTask.map((a) => a.units)
  const unitsTotal = totalAssignmentUnits(unitsForStamp.map((u) => ({ units: u })))
  let allocated = 0
  const stamp = new Map<string, { units: number; workHours: number }>()
  nextForTask.forEach((a, i) => {
    const units = unitsForStamp[i]!
    const isLast = i === nextForTask.length - 1
    const workHours =
      unitsTotal <= 0 || result.workHours <= 0
        ? 0
        : isLast
          ? roundHours(result.workHours - allocated)
          : roundHours(result.workHours * (units / unitsTotal))
    allocated += workHours
    stamp.set(a.id, { units, workHours })
  })

  const assignments = project.assignments.map((a) => {
    const patch = stamp.get(a.id)
    return patch ? a.with(patch) : a
  })

  const tasks = project.tasks.map((t) => {
    if (t.id !== taskId) return t
    return t.with({
      duration: Duration.hours(result.durationHours),
      workHours: result.workHours,
      finish: project
        .getCalendar()
        .addWorkingHours(t.start, result.durationHours),
    })
  })

  return project.with({ tasks, assignments })
}
