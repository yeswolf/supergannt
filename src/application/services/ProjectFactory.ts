import { Project } from '../../domain/entities/Project'
import { Task } from '../../domain/entities/Task'
import { Resource } from '../../domain/entities/Resource'
import { Dependency } from '../../domain/entities/Dependency'
import { Assignment } from '../../domain/entities/Assignment'
import { WorkCalendar } from '../../domain/entities/WorkCalendar'
import { Duration } from '../../domain/value-objects/Duration'
import { Money } from '../../domain/value-objects/Money'
import {
  asAssignmentId,
  asCalendarId,
  asDependencyId,
  asProjectId,
  asResourceId,
  asTaskId,
} from '../../domain/value-objects/Ids'
import { rebuildHierarchy } from '../../domain/services/HierarchyService'
import type { IdGenerator } from '../ports/IdGenerator'
import { refreshProject } from './ProjectRefresh'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(8, 0, 0, 0)
  return d
}

function taskDraft(
  ids: IdGenerator,
  input: {
    name: string
    outlineLevel: number
    hours: number
    percentComplete?: number
    milestone?: boolean
    priority?: number
    fixedCost?: number
    currency: string
    start: Date
  },
) {
  const hours = input.milestone ? 0 : input.hours
  return Task.create({
    id: asTaskId(ids.taskId()),
    name: input.name,
    outlineLevel: input.outlineLevel,
    wbs: '',
    start: input.start,
    finish: input.start,
    duration: Duration.hours(hours),
    percentComplete: input.percentComplete ?? 0,
    milestone: hours <= 0 && Boolean(input.milestone),
    summary: false,
    critical: false,
    notes: '',
    priority: input.priority ?? 500,
    constraintType: 'asSoonAsPossible',
    constraintDate: null,
    fixedCost: Money.of(input.fixedCost ?? 0, input.currency),
    cost: Money.of(input.fixedCost ?? 0, input.currency),
    workHours: hours,
    schedulingType: 'fixedUnits',
    effortDriven: true,
    parentId: null,
    baseline: null,
    collapsed: false,
  })
}

export function createEmptyProject(ids: IdGenerator, name = 'New Project'): Project {
  const calendarId = asCalendarId(ids.calendarId())
  const calendar = WorkCalendar.standard(calendarId)
  const start = startOfToday()
  return Project.create({
    id: asProjectId(ids.projectId()),
    name,
    title: name,
    manager: '',
    startDate: start,
    finishDate: start,
    statusDate: null,
    currency: 'USD',
    calendarId,
    tasks: [],
    resources: [],
    dependencies: [],
    assignments: [],
    calendars: [calendar],
    dirty: false,
    fileName: null,
  })
}

export function createDemoProject(ids: IdGenerator): Project {
  const base = createEmptyProject(ids, 'Website Launch')
  const currency = base.currency
  const start = base.startDate

  // Summary parents: hours 0 — refresh rolls up from children.
  // Leaves carry real duration/work; finish is computed by the scheduler.
  const tasks = rebuildHierarchy([
    taskDraft(ids, { name: 'Initiation', outlineLevel: 0, hours: 0, currency, start }),
    taskDraft(ids, {
      name: 'Kickoff meeting',
      outlineLevel: 1,
      hours: 8,
      percentComplete: 100,
      currency,
      start,
    }),
    taskDraft(ids, {
      name: 'Requirements',
      outlineLevel: 1,
      hours: 24,
      percentComplete: 50,
      priority: 600,
      currency,
      start,
    }),
    taskDraft(ids, { name: 'Design', outlineLevel: 0, hours: 0, currency, start }),
    taskDraft(ids, { name: 'UI mockups', outlineLevel: 1, hours: 32, currency, start }),
    taskDraft(ids, {
      name: 'Design approved',
      outlineLevel: 1,
      hours: 0,
      milestone: true,
      priority: 700,
      currency,
      start,
    }),
    taskDraft(ids, { name: 'Build & Launch', outlineLevel: 0, hours: 0, currency, start }),
    taskDraft(ids, {
      name: 'Frontend development',
      outlineLevel: 1,
      hours: 64,
      currency,
      start,
    }),
    taskDraft(ids, {
      name: 'Go live',
      outlineLevel: 1,
      hours: 0,
      milestone: true,
      priority: 900,
      fixedCost: 500,
      currency,
      start,
    }),
  ])

  const byName = new Map(tasks.map((t) => [t.name, t]))
  const must = (name: string) => {
    const task = byName.get(name)
    if (!task) throw new Error(`Demo task missing: ${name}`)
    return task
  }

  const fs = (pred: string, succ: string) =>
    Dependency.create({
      id: asDependencyId(ids.dependencyId()),
      predecessorId: must(pred).id,
      successorId: must(succ).id,
      type: 'FS',
      lag: Duration.zero(),
    })

  const dependencies = [
    fs('Kickoff meeting', 'Requirements'),
    fs('Requirements', 'UI mockups'),
    fs('UI mockups', 'Design approved'),
    fs('Design approved', 'Frontend development'),
    fs('Frontend development', 'Go live'),
  ]

  const alex = Resource.create({
    id: asResourceId(ids.resourceId()),
    name: 'Alex Designer',
    type: 'work',
    email: 'alex@example.com',
    group: 'Design',
    maxUnits: 1,
    standardRate: Money.of(75, currency),
    overtimeRate: Money.of(112.5, currency),
    costPerUse: Money.zero(currency),
    calendarId: base.calendarId,
    notes: '',
  })
  const sam = Resource.create({
    id: asResourceId(ids.resourceId()),
    name: 'Sam Developer',
    type: 'work',
    email: 'sam@example.com',
    group: 'Engineering',
    maxUnits: 1,
    standardRate: Money.of(90, currency),
    overtimeRate: Money.of(135, currency),
    costPerUse: Money.zero(currency),
    calendarId: base.calendarId,
    notes: '',
  })

  const assign = (taskName: string, resource: Resource, workHours: number) =>
    Assignment.create({
      id: asAssignmentId(ids.assignmentId()),
      taskId: must(taskName).id,
      resourceId: resource.id,
      units: 1,
      workHours,
      cost: Money.zero(currency),
    })

  const assignments = [
    assign('Kickoff meeting', alex, 8),
    assign('Requirements', alex, 24),
    assign('UI mockups', alex, 32),
    assign('Frontend development', sam, 64),
  ]

  return refreshProject(
    base.with({
      tasks,
      resources: [alex, sam],
      dependencies,
      assignments,
      dirty: false,
    }),
  ).with({ dirty: false })
}
