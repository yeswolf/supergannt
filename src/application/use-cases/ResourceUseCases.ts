import { Resource } from '../../domain/entities/Resource'
import { Assignment } from '../../domain/entities/Assignment'
import { Money } from '../../domain/value-objects/Money'
import {
  asAssignmentId,
  asResourceId,
  asTaskId,
} from '../../domain/value-objects/Ids'
import type { ResourceType } from '../../domain/entities/Resource'
import type { Project } from '../../domain/entities/Project'
import type { IdGenerator } from '../ports/IdGenerator'
import { refreshProject } from '../services/ProjectRefresh'

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
  const assignments = project.assignments.filter((a) => a.resourceId !== resourceId)
  return refreshProject(project.with({ resources, assignments }).markDirty())
}

export function assignResource(
  project: Project,
  ids: IdGenerator,
  taskId: string,
  resourceId: string,
  units = 1,
): Project {
  const existing = project.assignments.find(
    (a) => a.taskId === taskId && a.resourceId === resourceId,
  )
  if (existing) {
    const assignments = project.assignments.map((a) =>
      a.id === existing.id ? a.with({ units }) : a,
    )
    return refreshProject(project.with({ assignments }).markDirty())
  }

  const assignment = Assignment.create({
    id: asAssignmentId(ids.assignmentId()),
    taskId: asTaskId(taskId),
    resourceId: asResourceId(resourceId),
    units,
    workHours: 0,
    cost: Money.zero(project.currency),
  })
  return refreshProject(
    project.with({ assignments: [...project.assignments, assignment] }).markDirty(),
  )
}

export function unassignResource(
  project: Project,
  assignmentId: string,
): Project {
  const assignments = project.assignments.filter((a) => a.id !== assignmentId)
  return refreshProject(project.with({ assignments }).markDirty())
}

/** Replace all resources on a task (ProjectLibre Resources tab / Resource Names column). */
export function setTaskAssignments(
  project: Project,
  ids: IdGenerator,
  taskId: string,
  links: readonly { resourceId: string; units: number }[],
): Project {
  const kept = project.assignments.filter((a) => a.taskId !== taskId)
  const created = links.map((link) =>
    Assignment.create({
      id: asAssignmentId(ids.assignmentId()),
      taskId: asTaskId(taskId),
      resourceId: asResourceId(link.resourceId),
      units: link.units,
      workHours: 0,
      cost: Money.zero(project.currency),
    }),
  )
  return refreshProject(
    project.with({ assignments: [...kept, ...created] }).markDirty(),
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
