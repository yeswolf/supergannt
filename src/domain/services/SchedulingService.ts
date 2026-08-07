import type { Dependency } from '../entities/Dependency'
import type { Task } from '../entities/Task'
import type { WorkCalendar } from '../entities/WorkCalendar'
import type { TaskId } from '../value-objects/Ids'
import { Duration } from '../value-objects/Duration'
import { applyMilestoneRules } from './MilestonePolicy'

export interface FloatResult {
  totalSlackHours: number
  freeSlackHours: number
}

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
      case 'FS': {
        // Finish-to-start: successor may start at/after predecessor finish (+ lag).
        // Zero lag keeps the finish instant; scheduleOne snaps to work start, which
        // advances past end-of-day so a full working-day predecessor pushes to the
        // next morning (ProjectLibre ASAP).
        return calendar.addWorkingHours(pred.finish, lagHours)
      }
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
 * Compute total slack and free slack for every leaf task via
 * forward-pass (early dates from scheduled tasks) + backward-pass relaxation.
 * Summary tasks get null slack (not applicable — rolled up from children).
 *
 * Total slack  = late finish − early finish in working hours.
 * Free slack   = min delay before delaying any successor's early start.
 */
export function computeFloat(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
  calendar: WorkCalendar,
): Map<TaskId, FloatResult> {
  const leafTasks = tasks.filter((t) => !t.summary)
  const result = new Map<TaskId, FloatResult>()
  if (leafTasks.length === 0) return result

  const byId = new Map(tasks.map((t) => [t.id, t]))

  // Build successor adjacency
  const succs = new Map<TaskId, Dependency[]>()
  for (const dep of dependencies) {
    const s = succs.get(dep.predecessorId) ?? []
    s.push(dep)
    succs.set(dep.predecessorId, s)
  }

  // Project finish = max early finish of all leaf tasks
  const projectFinish = new Date(
    Math.max(...leafTasks.map((t) => t.finish.getTime())),
  )

  // Initialize late finish = project finish for all leaf tasks
  const lateFinish = new Map<TaskId, Date>()
  for (const t of leafTasks) {
    lateFinish.set(t.id, new Date(projectFinish.getTime()))
  }

  // Bellman-Ford relaxation: push late dates backward through the dependency graph.
  // Continue until no late finish moves earlier.
  const MAX_ITER = leafTasks.length + 10
  for (let iter = 0; iter < MAX_ITER; iter += 1) {
    let changed = false

    for (const dep of dependencies) {
      const pred = byId.get(dep.predecessorId)
      const succ = byId.get(dep.successorId)
      if (!pred || !succ || pred.summary || succ.summary) continue

      const succLf = lateFinish.get(succ.id)
      if (!succLf) continue

      const succDur = succ.milestone ? 0 : Math.max(0, succ.duration.toHours())
      const succLs = calendar.snapToWorkStart(
        calendar.addWorkingHours(succLf, -succDur),
      )
      const predDur = pred.milestone ? 0 : Math.max(0, pred.duration.toHours())
      const lagHours = dep.lag.toHours()

      let impliedPredLf: Date
      switch (dep.type) {
        case 'FS':
          impliedPredLf = calendar.addWorkingHours(succLs, -lagHours)
          break
        case 'FF':
          impliedPredLf = calendar.addWorkingHours(succLf, -lagHours)
          break
        case 'SS': {
          const predLs = calendar.addWorkingHours(succLs, -lagHours)
          impliedPredLf = calendar.addWorkingHours(predLs, predDur)
          break
        }
        case 'SF':
        default: {
          const predLs = calendar.addWorkingHours(succLf, -lagHours)
          impliedPredLf = calendar.addWorkingHours(predLs, predDur)
          break
        }
      }

      const cur = lateFinish.get(pred.id)
      if (!cur || impliedPredLf.getTime() < cur.getTime()) {
        lateFinish.set(pred.id, impliedPredLf)
        changed = true
      }
    }

    if (!changed) break
  }

  // Compute slack values
  for (const t of leafTasks) {
    const ef = t.finish
    const es = t.start
    const lf = lateFinish.get(t.id) ?? new Date(projectFinish.getTime())
    const dur = t.milestone ? 0 : Math.max(0, t.duration.toHours())
    const ls = calendar.snapToWorkStart(calendar.addWorkingHours(lf, -dur))

    // Total slack = late start − early start (or equivalently late finish − early finish)
    // Can be negative when a task is behind schedule.
    const totalSlackHours =
      es.getTime() <= ls.getTime()
        ? calendar.workingHoursBetween(es, ls)
        : -calendar.workingHoursBetween(ls, es)

    // Free slack = min delay before delaying any successor's early start
    let freeSlackHours = totalSlackHours
    const mySuccs = succs.get(t.id)
    if (mySuccs && mySuccs.length > 0) {
      let minFree = Infinity
      for (const dep of mySuccs) {
        const s = byId.get(dep.successorId)
        if (!s || s.summary) continue
        const lagHours = dep.lag.toHours()

        let constraintDate: Date
        let anchor: Date
        switch (dep.type) {
          case 'FS':
            anchor = ef
            constraintDate = calendar.addWorkingHours(s.start, -lagHours)
            break
          case 'SS':
            anchor = es
            constraintDate = calendar.addWorkingHours(s.start, -lagHours)
            break
          case 'FF':
            anchor = ef
            constraintDate = calendar.addWorkingHours(s.finish, -lagHours)
            break
          case 'SF':
          default:
            anchor = es
            constraintDate = calendar.addWorkingHours(s.finish, -lagHours)
            break
        }

        const free =
          anchor.getTime() <= constraintDate.getTime()
            ? calendar.workingHoursBetween(anchor, constraintDate)
            : -calendar.workingHoursBetween(constraintDate, anchor)

        if (free < minFree) minFree = free
      }
      freeSlackHours = Math.min(totalSlackHours, Math.max(0, minFree))
    }

    result.set(t.id, { totalSlackHours, freeSlackHours })
  }

  return result
}

/**
 * Apply computed float values to tasks: sets totalSlackHours, freeSlackHours,
 * and derives critical = totalSlackHours <= 0.
 * Summary tasks get null slack; their critical flag is derived from children.
 */
export function applyFloatToTasks(
  tasks: readonly Task[],
  floatMap: Map<TaskId, FloatResult>,
): Task[] {
  return tasks.map((t) => {
    if (t.summary) {
      return t.with({ totalSlackHours: null, freeSlackHours: null, critical: false })
    }
    const f = floatMap.get(t.id)
    if (!f) {
      return t.with({ totalSlackHours: null, freeSlackHours: null, critical: false })
    }
    return t.with({
      totalSlackHours: f.totalSlackHours,
      freeSlackHours: f.freeSlackHours,
      critical: f.totalSlackHours <= 0,
    })
  })
}

/**
 * Critical path via zero (working-hour) total float.
 * Matches ProjectLibre “critical = no slack” for the scheduled network.
 *
 * @deprecated Use `computeFloat` + `applyFloatToTasks` for proper slack-aware
 * critical path determination. This function remains for backward compatibility.
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

/**
 * Apply critical flags from a set of critical task IDs.
 *
 * @deprecated Use `applyFloatToTasks` for proper slack-aware critical flags.
 */
export function applyCriticalFlags(
  tasks: readonly Task[],
  criticalIds: ReadonlySet<TaskId>,
): Task[] {
  return tasks.map((t) => t.with({ critical: criticalIds.has(t.id) }))
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
