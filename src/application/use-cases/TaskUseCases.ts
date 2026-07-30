import { Task } from '../../domain/entities/Task'
import { Duration } from '../../domain/value-objects/Duration'
import { Money } from '../../domain/value-objects/Money'
import { asTaskId } from '../../domain/value-objects/Ids'
import type { TaskConstraintType } from '../../domain/entities/Task'
import type { TaskSchedulingType } from '../../domain/services/EffortScheduling'
import type { Project } from '../../domain/entities/Project'
import type { Assignment } from '../../domain/entities/Assignment'
import type { IdGenerator } from '../ports/IdGenerator'
import { refreshProject } from '../services/ProjectRefresh'
import { applyMilestoneRules } from '../../domain/services/MilestonePolicy'
import {
  recalculateForDurationChange,
  recalculateForWorkChange,
  roundHours,
  totalAssignmentUnits,
} from '../../domain/services/EffortScheduling'

function stampTaskAssignmentWork(
  assignments: readonly Assignment[],
  taskId: string,
  workHours: number,
  nextUnits?: readonly number[],
): Assignment[] {
  const mine = assignments.filter((a) => a.taskId === taskId)
  if (mine.length === 0) return [...assignments]
  const unitsList =
    nextUnits && nextUnits.length === mine.length
      ? [...nextUnits]
      : mine.map((a) => a.units)
  const unitsTotal = totalAssignmentUnits(unitsList.map((u) => ({ units: u })))
  let allocated = 0
  const stamp = new Map<string, { units: number; workHours: number }>()
  mine.forEach((a, i) => {
    const units = unitsList[i]!
    const isLast = i === mine.length - 1
    const share =
      unitsTotal <= 0 || workHours <= 0
        ? 0
        : isLast
          ? roundHours(workHours - allocated)
          : roundHours(workHours * (units / unitsTotal))
    allocated += share
    stamp.set(a.id, { units, workHours: share })
  })
  return assignments.map((a) => {
    const patch = stamp.get(a.id)
    return patch ? a.with(patch) : a
  })
}

export interface AddTaskInput {
  name?: string
  afterTaskId?: string
  /** Duration in working hours (minimal slot). */
  durationHours?: number
  /** @deprecated use durationHours */
  durationDays?: number
  milestone?: boolean
  schedulingType?: TaskSchedulingType
  effortDriven?: boolean
}

function resolveHours(input: AddTaskInput): number {
  if (input.milestone) return 0
  if (input.durationHours !== undefined) return Math.max(0, input.durationHours)
  if (input.durationDays !== undefined) return Math.max(0, input.durationDays * 8)
  return 8 // default = 1 working day
}

export function addTask(
  project: Project,
  ids: IdGenerator,
  input: AddTaskInput = {},
): Project {
  const start = project.startDate
  const hours = resolveHours(input)
  const draft = {
    id: asTaskId(ids.taskId()),
    name: input.name?.trim() || 'New Task',
    outlineLevel: 0,
    wbs: '1',
    start,
    finish: start,
    duration: Duration.hours(hours),
    percentComplete: 0,
    milestone: hours <= 0,
    summary: false,
    critical: false,
    notes: '',
    priority: 500,
    constraintType: 'asSoonAsPossible' as const,
    constraintDate: null,
    fixedCost: Money.zero(project.currency),
    cost: Money.zero(project.currency),
    workHours: hours,
    schedulingType: input.schedulingType ?? ('fixedUnits' as const),
    effortDriven:
      input.effortDriven ??
      (input.schedulingType === 'fixedDuration' ? false : true),
    parentId: null,
    baseline: null,
    collapsed: false,
  }
  const task = Task.create({
    ...draft,
    ...applyMilestoneRules(draft, { forceMilestone: hours <= 0 }),
  })

  let tasks = [...project.tasks]
  if (input.afterTaskId) {
    const index = tasks.findIndex((t) => t.id === input.afterTaskId)
    if (index >= 0) {
      const after = tasks[index]!
      const inserted = task.with({ outlineLevel: after.outlineLevel })
      tasks.splice(index + 1, 0, inserted)
    } else {
      tasks.push(task)
    }
  } else {
    tasks.push(task)
  }

  return refreshProject(project.with({ tasks }).markDirty())
}

export function updateTask(
  project: Project,
  taskId: string,
  patch: Partial<{
    name: string
    durationHours: number
    durationDays: number
    percentComplete: number
    milestone: boolean
    notes: string
    priority: number
    fixedCost: number
    start: Date
    finish: Date
    workHours: number
    constraintType: TaskConstraintType
    constraintDate: Date | null
    schedulingType: TaskSchedulingType
    effortDriven: boolean
  }>,
): Project {
  const calendar = project.getCalendar()
  const taskAssignments = project.assignments.filter((a) => a.taskId === taskId)

  let nextAssignments: Assignment[] = [...project.assignments]

  const tasks = project.tasks.map((task) => {
    if (task.id !== taskId) return task

    const nextStart = patch.start ?? task.start
    let nextFinish = patch.finish ?? task.finish

    let nextHours = task.duration.toHours()
    if (patch.durationHours !== undefined) nextHours = Math.max(0, patch.durationHours)
    else if (patch.durationDays !== undefined) nextHours = Math.max(0, patch.durationDays * 8)
    else if (patch.milestone === true) nextHours = 0
    else if (
      // Finish edited without explicit duration → derive working hours from start→finish.
      // Start-only edits keep duration (ProjectLibre / Gantt move).
      patch.finish !== undefined &&
      patch.durationHours === undefined &&
      patch.durationDays === undefined
    ) {
      const hours = calendar.workingHoursBetween(nextStart, nextFinish)
      nextHours = Math.max(0, Math.round(hours * 100) / 100)
    }

    let nextWork = patch.workHours ?? task.workHours
    const schedulingType = patch.schedulingType ?? task.schedulingType
    const effortDriven = patch.effortDriven ?? task.effortDriven

    const durationEdited =
      patch.durationHours !== undefined ||
      patch.durationDays !== undefined ||
      (patch.finish !== undefined &&
        patch.durationHours === undefined &&
        patch.durationDays === undefined &&
        patch.workHours === undefined)
    const workEdited = patch.workHours !== undefined && !durationEdited

    if (!task.summary && patch.milestone !== true) {
      if (workEdited) {
        const result = recalculateForWorkChange({
          schedulingType,
          durationHours: task.duration.toHours(),
          workHours: nextWork,
          assignments: taskAssignments.map((a) => ({
            units: a.units,
            workHours: a.workHours,
          })),
        })
        nextHours = result.durationHours
        nextWork = result.workHours
        nextAssignments = stampTaskAssignmentWork(
          project.assignments,
          taskId,
          result.workHours,
          result.nextUnits,
        )
      } else if (durationEdited) {
        const result = recalculateForDurationChange({
          schedulingType,
          workHours: task.workHours,
          durationHours: nextHours,
          assignments: taskAssignments.map((a) => ({
            units: a.units,
            workHours: a.workHours,
          })),
        })
        nextHours = result.durationHours
        nextWork = result.workHours
        nextAssignments = stampTaskAssignmentWork(
          project.assignments,
          taskId,
          result.workHours,
          result.nextUnits,
        )
      }
    }

    const nextDuration = Duration.hours(nextHours)

    // Keep finish consistent with start+duration when start moves or duration changes
    // without an explicit finish (scheduler will refine, but Task.create needs finish >= start).
    if (patch.finish === undefined || durationEdited || workEdited) {
      nextFinish = calendar.addWorkingHours(nextStart, nextHours)
    } else if (nextFinish.getTime() < nextStart.getTime()) {
      nextFinish = calendar.addWorkingHours(nextStart, nextHours)
    }
    let constraintType = patch.constraintType ?? task.constraintType
    let constraintDate =
      patch.constraintDate !== undefined ? patch.constraintDate : task.constraintDate

    // ProjectLibre: dragging a bar / editing Start sets Start No Earlier Than
    // so predecessors can still push the task later.
    if (
      patch.start !== undefined &&
      patch.constraintType === undefined &&
      patch.start.getTime() !== task.start.getTime()
    ) {
      constraintType = 'startNoEarlierThan'
      constraintDate = patch.start
    }

    const draft = {
      ...task.toProps(),
      name: patch.name ?? task.name,
      duration: nextDuration,
      percentComplete: patch.percentComplete ?? task.percentComplete,
      milestone: patch.milestone ?? task.milestone,
      notes: patch.notes ?? task.notes,
      priority: patch.priority ?? task.priority,
      fixedCost:
        patch.fixedCost !== undefined
          ? Money.of(patch.fixedCost, project.currency)
          : task.fixedCost,
      start: nextStart,
      finish: nextFinish,
      workHours: nextWork,
      schedulingType,
      effortDriven,
      constraintType,
      constraintDate,
    }
    return Task.create({
      ...draft,
      ...applyMilestoneRules(draft, {
        forceMilestone: patch.milestone === true || nextHours <= 0,
        forceNotMilestone: patch.milestone === false && nextHours > 0,
      }),
    })
  })
  return refreshProject(
    project.with({ tasks, assignments: nextAssignments }).markDirty(),
  )
}

export function deleteTask(project: Project, taskId: string): Project {
  const toRemove = new Set<string>()
  const index = project.tasks.findIndex((t) => t.id === taskId)
  if (index < 0) return project
  const level = project.tasks[index]!.outlineLevel
  toRemove.add(taskId)
  for (let i = index + 1; i < project.tasks.length; i += 1) {
    const t = project.tasks[i]!
    if (t.outlineLevel <= level) break
    toRemove.add(t.id)
  }

  const tasks = project.tasks.filter((t) => !toRemove.has(t.id))
  const dependencies = project.dependencies.filter(
    (d) => !toRemove.has(d.predecessorId) && !toRemove.has(d.successorId),
  )
  const assignments = project.assignments.filter((a) => !toRemove.has(a.taskId))
  return refreshProject(
    project.with({ tasks, dependencies, assignments }).markDirty(),
  )
}

export function addMilestone(
  project: Project,
  ids: IdGenerator,
  afterTaskId?: string,
): Project {
  return addTask(project, ids, {
    name: 'New Milestone',
    afterTaskId,
    durationHours: 0,
    milestone: true,
  })
}
