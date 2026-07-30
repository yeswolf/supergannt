import { Project } from '../../domain/entities/Project'
import { Task } from '../../domain/entities/Task'
import { Resource } from '../../domain/entities/Resource'
import { Dependency } from '../../domain/entities/Dependency'
import { Assignment } from '../../domain/entities/Assignment'
import { WorkCalendar } from '../../domain/entities/WorkCalendar'
import { Duration, type DurationUnit } from '../../domain/value-objects/Duration'
import { Money } from '../../domain/value-objects/Money'
import {
  asAssignmentId,
  asCalendarId,
  asDependencyId,
  asProjectId,
  asResourceId,
  asTaskId,
} from '../../domain/value-objects/Ids'
import type { LinkType } from '../../domain/entities/Dependency'
import type { ResourceType } from '../../domain/entities/Resource'
import type { TaskConstraintType, TaskBaseline } from '../../domain/entities/Task'
import type { TaskSchedulingType } from '../../domain/services/EffortScheduling'

interface SerializedProject {
  id: string
  name: string
  title: string
  manager: string
  startDate: string
  finishDate: string
  statusDate: string | null
  currency: string
  calendarId: string
  dirty: boolean
  fileName: string | null
  tasks: ReturnType<Task['toProps']>[]
  resources: ReturnType<Resource['toProps']>[]
  dependencies: ReturnType<Dependency['toProps']>[]
  assignments: ReturnType<Assignment['toProps']>[]
  calendars: ReturnType<WorkCalendar['toProps']>[]
}

function reviveDuration(d: { amount: number; unit: DurationUnit }): Duration {
  return Duration.of(d.amount, d.unit)
}

function reviveMoney(m: { amount: number; currency: string }): Money {
  return Money.of(m.amount, m.currency)
}

function reviveBaseline(b: TaskBaseline | null): TaskBaseline | null {
  if (!b) return null
  return {
    start: b.start ? new Date(b.start) : null,
    finish: b.finish ? new Date(b.finish) : null,
    duration: reviveDuration(b.duration as unknown as { amount: number; unit: DurationUnit }),
    cost: reviveMoney(b.cost as unknown as { amount: number; currency: string }),
  }
}

export function serializeProject(project: Project): string {
  const props = project.toProps()
  const payload: SerializedProject = {
    id: props.id,
    name: props.name,
    title: props.title,
    manager: props.manager,
    startDate: props.startDate.toISOString(),
    finishDate: props.finishDate.toISOString(),
    statusDate: props.statusDate?.toISOString() ?? null,
    currency: props.currency,
    calendarId: props.calendarId,
    dirty: props.dirty,
    fileName: props.fileName,
    tasks: props.tasks.map((t) => {
      const p = t.toProps()
      return {
        ...p,
        start: p.start,
        finish: p.finish,
        constraintDate: p.constraintDate,
      }
    }),
    resources: props.resources.map((r) => r.toProps()),
    dependencies: props.dependencies.map((d) => d.toProps()),
    assignments: props.assignments.map((a) => a.toProps()),
    calendars: props.calendars.map((c) => c.toProps()),
  }
  return JSON.stringify(payload, (_key, value) => {
    if (value instanceof Date) return value.toISOString()
    if (value && typeof value === 'object' && 'amount' in value && 'unit' in value) {
      return { amount: value.amount, unit: value.unit }
    }
    if (value && typeof value === 'object' && 'amount' in value && 'currency' in value) {
      return { amount: value.amount, currency: value.currency }
    }
    return value
  })
}

export function deserializeProject(raw: string): Project {
  const data = JSON.parse(raw) as SerializedProject
  const tasks = data.tasks.map((t) =>
    Task.create({
      id: asTaskId(t.id),
      name: t.name,
      outlineLevel: t.outlineLevel,
      wbs: t.wbs,
      start: new Date(t.start),
      finish: new Date(t.finish),
      duration: reviveDuration(t.duration as unknown as { amount: number; unit: DurationUnit }),
      percentComplete: t.percentComplete,
      milestone: t.milestone,
      summary: t.summary,
      critical: t.critical,
      notes: t.notes,
      priority: t.priority,
      constraintType: t.constraintType as TaskConstraintType,
      constraintDate: t.constraintDate ? new Date(t.constraintDate) : null,
      fixedCost: reviveMoney(t.fixedCost as unknown as { amount: number; currency: string }),
      cost: reviveMoney(t.cost as unknown as { amount: number; currency: string }),
      workHours: t.workHours,
      schedulingType: (t.schedulingType as TaskSchedulingType | undefined) ?? 'fixedUnits',
      effortDriven: t.effortDriven ?? true,
      parentId: t.parentId ? asTaskId(t.parentId) : null,
      baseline: reviveBaseline(t.baseline),
      collapsed: t.collapsed,
    }),
  )

  const resources = data.resources.map((r) =>
    Resource.create({
      id: asResourceId(r.id),
      name: r.name,
      type: r.type as ResourceType,
      email: r.email,
      group: r.group,
      maxUnits: r.maxUnits,
      standardRate: reviveMoney(r.standardRate as unknown as { amount: number; currency: string }),
      overtimeRate: reviveMoney(r.overtimeRate as unknown as { amount: number; currency: string }),
      costPerUse: reviveMoney(r.costPerUse as unknown as { amount: number; currency: string }),
      calendarId: r.calendarId,
      notes: r.notes,
    }),
  )

  const dependencies = data.dependencies.map((d) =>
    Dependency.create({
      id: asDependencyId(d.id),
      predecessorId: asTaskId(d.predecessorId),
      successorId: asTaskId(d.successorId),
      type: d.type as LinkType,
      lag: reviveDuration(d.lag as unknown as { amount: number; unit: DurationUnit }),
    }),
  )

  const assignments = data.assignments.map((a) =>
    Assignment.create({
      id: asAssignmentId(a.id),
      taskId: asTaskId(a.taskId),
      resourceId: asResourceId(a.resourceId),
      units: a.units,
      workHours: a.workHours,
      cost: reviveMoney(a.cost as unknown as { amount: number; currency: string }),
    }),
  )

  const calendars = data.calendars.map((c) =>
    WorkCalendar.create({
      id: asCalendarId(c.id),
      name: c.name,
      isBase: c.isBase,
      workDays: c.workDays,
      exceptions: c.exceptions.map((e) => ({
        ...e,
        date: new Date(e.date),
      })),
    }),
  )

  return Project.create({
    id: asProjectId(data.id),
    name: data.name,
    title: data.title,
    manager: data.manager,
    startDate: new Date(data.startDate),
    finishDate: new Date(data.finishDate),
    statusDate: data.statusDate ? new Date(data.statusDate) : null,
    currency: data.currency,
    calendarId: asCalendarId(data.calendarId),
    tasks,
    resources,
    dependencies,
    assignments,
    calendars,
    dirty: data.dirty,
    fileName: data.fileName,
  })
}
