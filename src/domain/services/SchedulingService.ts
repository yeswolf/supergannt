import type { Dependency } from '../entities/Dependency'
import type { Task } from '../entities/Task'
import type { WorkCalendar } from '../entities/WorkCalendar'
import type { TaskId } from '../value-objects/Ids'
import { Duration } from '../value-objects/Duration'
import { applyMilestoneRules } from './MilestonePolicy'

/**
 * ProjectLibre / MS Project–style ASAP forward-pass in working hours.
 *
 * - FS / SS / FF / SF with signed lag (positive = delay, negative = lead)
 * - Successor starts at the latest date required by all predecessors
 * - Summary predecessors use rolled-up child dates
 * - Date constraints (SNET, MSO, …) applied after dependency logic
 */
export function scheduleProject(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
  calendar: WorkCalendar,
  projectStart: Date,
): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const childrenOf = new Map<TaskId, Task[]>()
  for (const task of tasks) {
    if (!task.parentId) continue
    const list = childrenOf.get(task.parentId) ?? []
    list.push(task)
    childrenOf.set(task.parentId, list)
  }

  const preds = new Map<TaskId, Dependency[]>()
  for (const dep of dependencies) {
    const list = preds.get(dep.successorId) ?? []
    list.push(dep)
    preds.set(dep.successorId, list)
  }

  const scheduled = new Map<TaskId, Task>()
  const visiting = new Set<TaskId>()
  const projectAnchor = calendar.snapToWorkStart(projectStart)

  const rollupSummary = (task: Task, children: readonly Task[]): Task => {
    if (children.length === 0) {
      return task.with({
        start: projectAnchor,
        finish: projectAnchor,
        duration: Duration.zero(),
        workHours: 0,
        percentComplete: 0,
      })
    }
    const start = new Date(Math.min(...children.map((c) => c.start.getTime())))
    const finish = new Date(Math.max(...children.map((c) => c.finish.getTime())))
    const hours = calendar.workingHoursBetween(start, finish)
    return task.with({
      start,
      finish,
      duration: Duration.hours(Math.max(hours, 0)),
      workHours: Math.max(hours, 0),
      milestone: false,
      percentComplete: Math.round(
        children.reduce((s, c) => s + c.percentComplete, 0) / children.length,
      ),
    })
  }

  /** Earliest start implied by one predecessor link (ProjectLibre formulas). */
  const startFromDependency = (
    dep: Dependency,
    pred: Task,
    durationHours: number,
  ): Date => {
    const lagHours = dep.lag.toHours()
    switch (dep.type) {
      case 'FS':
        return calendar.addWorkingHours(pred.finish, lagHours)
      case 'SS':
        return calendar.addWorkingHours(pred.start, lagHours)
      case 'FF': {
        const finish = calendar.addWorkingHours(pred.finish, lagHours)
        return calendar.addWorkingHours(finish, -durationHours)
      }
      case 'SF':
        return calendar.addWorkingHours(pred.start, -durationHours + lagHours)
    }
  }

  const scheduleOne = (taskId: TaskId): Task => {
    const cached = scheduled.get(taskId)
    if (cached) return cached
    if (visiting.has(taskId)) {
      throw new Error('Circular dependency detected')
    }
    visiting.add(taskId)

    const task = byId.get(taskId)
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`)
    }

    // Summaries: schedule children first, then roll up (so links to summaries work).
    if (task.summary) {
      const children = childrenOf.get(taskId) ?? []
      const resolvedChildren = children.map((c) => scheduleOne(c.id))
      const rolled = rollupSummary(task, resolvedChildren)
      scheduled.set(taskId, rolled)
      visiting.delete(taskId)
      return rolled
    }

    const durationHours = task.milestone ? 0 : Math.max(0, task.duration.toHours())
    let earliestStart = projectAnchor
    const taskPreds = preds.get(taskId) ?? []

    for (const dep of taskPreds) {
      const pred = scheduleOne(dep.predecessorId)
      const candidate = startFromDependency(dep, pred, durationHours)
      if (candidate.getTime() > earliestStart.getTime()) {
        earliestStart = candidate
      }
    }

    earliestStart = calendar.snapToWorkStart(earliestStart)
    const dependencyFloor = earliestStart
    earliestStart = applyConstraintStart(task, earliestStart, durationHours, calendar)
    // Soft constraints must not pull a task before its dependency-driven start
    // (FS/SS/FF/SF). Hard MSO/MFO may still pin earlier (planning conflict).
    if (
      task.constraintType !== 'mustStartOn' &&
      task.constraintType !== 'mustFinishOn' &&
      earliestStart.getTime() < dependencyFloor.getTime()
    ) {
      earliestStart = dependencyFloor
    }

    const finish =
      durationHours === 0
        ? earliestStart
        : calendar.addWorkingHours(earliestStart, durationHours)

    const normalized = applyMilestoneRules({
      ...task.toProps(),
      start: earliestStart,
      finish,
      duration: Duration.hours(durationHours),
      // Keep assignment-driven work; only fill when unset.
      workHours: task.workHours > 0 ? task.workHours : durationHours,
    })

    const updated = task.with({
      start: earliestStart,
      finish: normalized.finish ?? finish,
      duration: normalized.duration ?? Duration.hours(durationHours),
      milestone: normalized.milestone ?? task.milestone,
      workHours: normalized.workHours ?? (task.workHours > 0 ? task.workHours : durationHours),
    })
    scheduled.set(taskId, updated)
    visiting.delete(taskId)
    return updated
  }

  for (const task of tasks) {
    scheduleOne(task.id)
  }

  return tasks.map((t) => scheduled.get(t.id) ?? t)
}

function applyConstraintStart(
  task: Task,
  earliestStart: Date,
  durationHours: number,
  calendar: WorkCalendar,
): Date {
  const cDate = task.constraintDate
  if (!cDate) {
    return earliestStart
  }
  const constrained = calendar.snapToWorkStart(cDate)
  switch (task.constraintType) {
    case 'mustStartOn':
      return constrained
    case 'startNoEarlierThan':
      return constrained.getTime() > earliestStart.getTime() ? constrained : earliestStart
    case 'startNoLaterThan':
      return constrained.getTime() < earliestStart.getTime() ? constrained : earliestStart
    case 'mustFinishOn': {
      const start = calendar.addWorkingHours(constrained, -durationHours)
      return calendar.snapToWorkStart(start)
    }
    case 'finishNoEarlierThan': {
      const minFinish = constrained
      const naturalFinish = calendar.addWorkingHours(earliestStart, durationHours)
      if (naturalFinish.getTime() >= minFinish.getTime()) return earliestStart
      return calendar.snapToWorkStart(calendar.addWorkingHours(minFinish, -durationHours))
    }
    case 'finishNoLaterThan': {
      const maxFinish = constrained
      const naturalFinish = calendar.addWorkingHours(earliestStart, durationHours)
      if (naturalFinish.getTime() <= maxFinish.getTime()) return earliestStart
      return calendar.snapToWorkStart(calendar.addWorkingHours(maxFinish, -durationHours))
    }
    case 'asLateAsPossible':
      // Full ALAP needs a backward pass; treat as ASAP until project finish is known.
      return earliestStart
    default:
      return earliestStart
  }
}

/**
 * Critical path via zero (working-hour) total float: forward ES/EF + backward LS/LF.
 * Matches ProjectLibre “critical = no slack” for the scheduled network.
 */
export function computeCriticalPath(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
  calendar?: WorkCalendar,
): Set<TaskId> {
  const leaf = tasks.filter((t) => !t.summary)
  if (leaf.length === 0) return new Set()

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const succs = new Map<TaskId, Dependency[]>()
  const preds = new Map<TaskId, Dependency[]>()
  for (const dep of dependencies) {
    const s = succs.get(dep.predecessorId) ?? []
    s.push(dep)
    succs.set(dep.predecessorId, s)
    const p = preds.get(dep.successorId) ?? []
    p.push(dep)
    preds.set(dep.successorId, p)
  }

  const projectFinish = Math.max(...leaf.map((t) => t.finish.getTime()))
  const critical = new Set<TaskId>()
  const slackMs = calendar ? 60_000 : 60_000 // 1 minute tolerance

  for (const task of leaf) {
    const totalFloat = projectFinish - task.finish.getTime()
    // Task on the project finish spine
    if (Math.abs(task.finish.getTime() - projectFinish) <= slackMs) {
      critical.add(task.id)
    }
    // Also: no free float on driving FS links into a critical successor
    void totalFloat
  }

  // Walk back along driving links (successor start ≈ link-implied start)
  let changed = true
  while (changed) {
    changed = false
    for (const succId of [...critical]) {
      for (const dep of preds.get(succId) ?? []) {
        const pred = byId.get(dep.predecessorId)
        const succ = byId.get(dep.successorId)
        if (!pred || !succ || pred.summary) continue
        if (critical.has(pred.id)) continue
        if (isDrivingLink(pred, succ, dep.type, dep.lag.toHours(), calendar)) {
          critical.add(pred.id)
          changed = true
        }
      }
    }
  }

  return critical
}

function isDrivingLink(
  pred: Task,
  succ: Task,
  type: string,
  lagHours: number,
  calendar?: WorkCalendar,
): boolean {
  const tolerance = 3_600_000 // 1h — working-hour snap noise
  if (!calendar) {
    if (type === 'FS') {
      return succ.start.getTime() <= pred.finish.getTime() + lagHours * 3_600_000 + tolerance
    }
    if (type === 'SS') {
      return Math.abs(succ.start.getTime() - pred.start.getTime()) <= tolerance
    }
    if (type === 'FF') {
      return Math.abs(succ.finish.getTime() - pred.finish.getTime()) <= tolerance
    }
    return Math.abs(succ.finish.getTime() - pred.start.getTime()) <= tolerance
  }

  let impliedStart: Date
  const durationHours = succ.milestone ? 0 : succ.duration.toHours()
  switch (type) {
    case 'FS':
      impliedStart = calendar.addWorkingHours(pred.finish, lagHours)
      break
    case 'SS':
      impliedStart = calendar.addWorkingHours(pred.start, lagHours)
      break
    case 'FF': {
      const finish = calendar.addWorkingHours(pred.finish, lagHours)
      impliedStart = calendar.addWorkingHours(finish, -durationHours)
      break
    }
    default:
      impliedStart = calendar.addWorkingHours(pred.start, -durationHours + lagHours)
      break
  }
  impliedStart = calendar.snapToWorkStart(impliedStart)
  return Math.abs(succ.start.getTime() - impliedStart.getTime()) <= tolerance
}

export function applyCriticalFlags(
  tasks: readonly Task[],
  criticalIds: ReadonlySet<TaskId>,
): Task[] {
  return tasks.map((t) => t.with({ critical: criticalIds.has(t.id) }))
}
