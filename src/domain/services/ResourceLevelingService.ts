import type { Task } from '../entities/Task'
import type { Dependency } from '../entities/Dependency'
import type { Resource } from '../entities/Resource'
import type { Assignment } from '../entities/Assignment'
import type { WorkCalendar } from '../entities/WorkCalendar'
import type { TaskId } from '../value-objects/Ids'

export type LevelingOrder = 'priority' | 'standard'

export interface LevelingOptions {
  /** Which tasks to consider for leveling (subset of all task IDs). */
  scope: TaskId[]
  /** Leveling order strategy. */
  order: LevelingOrder
}

export interface LeveledTask {
  taskId: TaskId
  name: string
  oldStart: Date
  newStart: Date
  delayHours: number
}

export interface LevelingResult {
  tasks: Task[]
  leveled: LeveledTask[]
  overallocationsBefore: number
  overallocationsAfter: number
  finishBefore: Date
  finishAfter: Date
}

/**
 * Run resource leveling on a set of scheduled tasks.
 *
 * Greedy forward-pass algorithm with multiple refinement passes:
 * iterate day-by-day across the project date range, detect periods
 * where assignedUnits > maxUnits, and delay lower-priority /
 * higher-slack tasks until allocation fits.
 *
 * Does NOT: split tasks, change assignments, or modify resource max units.
 * Does respect: task priorities, dependency chains (via successor cascade),
 * and Must Start On / Must Finish On hard constraints.
 */
export function levelResources(
  tasks: readonly Task[],
  dependencies: readonly Dependency[],
  resources: readonly Resource[],
  assignments: readonly Assignment[],
  calendar: WorkCalendar,
  projectStart: Date,
  options: LevelingOptions = { scope: tasks.map((t) => t.id), order: 'priority' },
): LevelingResult {
  const scopeSet = new Set(options.scope)

  // Count overallocations before
  const beforeCount = countOverallocations(tasks, resources, assignments, calendar)
  if (beforeCount === 0) {
    return {
      tasks: [...tasks],
      leveled: [],
      overallocationsBefore: 0,
      overallocationsAfter: 0,
      finishBefore: computeFinish(tasks),
      finishAfter: computeFinish(tasks),
    }
  }

  // Build working copy
  let working = [...tasks]
  const leveledMap = new Map<TaskId, LeveledTask>()

  // Precompute successor map for cascade
  const successors = new Map<TaskId, TaskId[]>()
  for (const dep of dependencies) {
    const list = successors.get(dep.predecessorId) ?? []
    list.push(dep.successorId)
    successors.set(dep.predecessorId, list)
  }

  // Assignments by task
  const assignmentsByTask = new Map<TaskId, Assignment[]>()
  for (const a of assignments) {
    const list = assignmentsByTask.get(a.taskId) ?? []
    list.push(a)
    assignmentsByTask.set(a.taskId, list)
  }

  const resourceById = new Map(resources.map((r) => [r.id, r]))

  // Multiple refinement passes — each pass resolves what it can, and subsequent
  // passes clean up cascaded overallocations. Up to 10 passes.
  const MAX_PASSES = 10
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const result = levelingPass(
      working,
      calendar,
      resourceById,
      assignmentsByTask,
      scopeSet,
      successors,
      leveledMap,
      options.order,
    )
    working = result.tasks

    // Check if all overallocations resolved
    const afterCount = countOverallocations(working, resources, assignments, calendar)
    if (afterCount === 0) break

    // If no progress, stop
    if (!result.anyProgress) break
  }

  const afterCount = countOverallocations(working, resources, assignments, calendar)

  // Sort leveled list by delay (most delayed first) for display
  const leveledList = [...leveledMap.values()].sort(
    (a, b) => b.delayHours - a.delayHours,
  )

  return {
    tasks: working,
    leveled: leveledList,
    overallocationsBefore: beforeCount,
    overallocationsAfter: afterCount,
    finishBefore: computeFinish(tasks),
    finishAfter: computeFinish(working),
  }
}

interface PassResult {
  tasks: Task[]
  anyProgress: boolean
}

function levelingPass(
  tasks: Task[],
  calendar: WorkCalendar,
  resourceById: Map<string, Resource>,
  assignmentsByTask: Map<TaskId, Assignment[]>,
  scope: Set<TaskId>,
  successors: Map<TaskId, TaskId[]>,
  leveledMap: Map<TaskId, LeveledTask>,
  order: LevelingOrder,
): PassResult {
  const nonSummary = tasks.filter((t) => !t.summary && t.duration.toHours() > 0 && scope.has(t.id))
  if (nonSummary.length === 0) return { tasks, anyProgress: false }

  const startDate = new Date(Math.min(...nonSummary.map((t) => t.start.getTime())))
  let endDate = new Date(Math.max(...nonSummary.map((t) => t.finish.getTime())))

  startDate.setHours(0, 0, 0, 0)
  endDate.setHours(0, 0, 0, 0)

  const working = [...tasks]
  let anyProgress = false

  // Sort all levelable tasks by priority (for determining who gets delayed)
  const sortKey = (t: Task): number => {
    if (order === 'priority') {
      return t.priority
    }
    // standard: higher slack = safer to delay → sort by slack descending
    return -(t.totalSlackHours ?? Number.MAX_SAFE_INTEGER)
  }

  const cursor = new Date(startDate.getTime())
  let dayCount = 0
  const maxDays = 3650

  while (cursor.getTime() <= endDate.getTime() && dayCount < maxDays) {
    dayCount += 1
    const dayStart = new Date(cursor.getTime())
    const dayEnd = new Date(cursor.getTime())
    dayEnd.setDate(dayEnd.getDate() + 1)

    if (!calendar.isWorkingDay(dayStart)) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    // Find all active tasks on this day
    const byId = new Map(working.map((t) => [t.id, t]))
    const active = working.filter(
      (t) =>
        !t.summary &&
        t.duration.toHours() > 0 &&
        scope.has(t.id) &&
        t.start.getTime() < dayEnd.getTime() &&
        t.finish.getTime() > dayStart.getTime(),
    )

    if (active.length === 0) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    // Group by resource
    const resourceTasks = new Map<string, Task[]>()
    for (const task of active) {
      const taskAssignments = assignmentsByTask.get(task.id) ?? []
      for (const a of taskAssignments) {
        const resource = resourceById.get(a.resourceId)
        if (!resource || resource.maxUnits <= 0) continue
        let list = resourceTasks.get(a.resourceId)
        if (!list) {
          list = []
          resourceTasks.set(a.resourceId, list)
        }
        list.push(task)
      }
    }

    for (const [resourceId, resTasks] of resourceTasks) {
      const resource = resourceById.get(resourceId)
      if (!resource) continue

      // Deduplicate tasks and compute per-task units
      const uniqueTasks = [...new Map(resTasks.map((t) => [t.id, t])).values()]
      const taskUnits = new Map<TaskId, number>()
      for (const task of uniqueTasks) {
        const taskAssignments = assignmentsByTask.get(task.id) ?? []
        const total = taskAssignments
          .filter((a) => a.resourceId === resourceId)
          .reduce((s, a) => s + a.units, 0)
        taskUnits.set(task.id, total)
      }

      const totalUnits = [...taskUnits.values()].reduce((s, u) => s + u, 0)
      if (totalUnits <= resource.maxUnits) continue

      // Sort tasks: lower sortKey first = delayed first
      // For priority order: lower priority first
      // For standard order: higher slack first (negative slack means sortKey is positive, so delayed later)
      const sorted = [...uniqueTasks].sort((a, b) => {
        const ka = sortKey(a)
        const kb = sortKey(b)
        if (ka !== kb) return ka - kb
        // Tie-break by task ID
        return a.id.localeCompare(b.id)
      })

      // Reverse traversal: keep the HIGHEST-priority tasks (end of sorted list)
      // and delay the lowest-priority ones (start of sorted list).
      // Hard-constrained tasks are automatically kept since they cannot be delayed.
      const hardConstrained = new Set<TaskId>()
      for (const task of sorted) {
        if (task.constraintType === 'mustStartOn' || task.constraintType === 'mustFinishOn') {
          hardConstrained.add(task.id)
        }
      }

      let currentLoad = 0
      const keepTasks = new Set<TaskId>(hardConstrained)
      // Count hard-constrained unit load already committed
      for (const id of hardConstrained) {
        currentLoad += taskUnits.get(id) ?? 0
      }
      // Then add highest-priority flex tasks until at capacity
      for (let i = sorted.length - 1; i >= 0; i--) {
        const task = sorted[i]!
        if (hardConstrained.has(task.id)) continue
        const units = taskUnits.get(task.id) ?? 0
        if (currentLoad + units > resource.maxUnits) break
        keepTasks.add(task.id)
        currentLoad += units
      }

      // Delay all tasks not in the keep set that overlap this day
      const toDelay = sorted.filter((t) => !keepTasks.has(t.id))

      // Compute the base target: the latest finish among kept tasks on this
      // resource that are active on this day (or next day if none).
      const keptActive = sorted.filter(
        (t) =>
          keepTasks.has(t.id) &&
          t.start.getTime() < dayEnd.getTime() &&
          t.finish.getTime() > dayStart.getTime(),
      )
      let slotStart = dayEnd
      if (keptActive.length > 0) {
        const latestKeptFinish = new Date(
          Math.max(...keptActive.map((t) => t.finish.getTime())),
        )
        slotStart =
          latestKeptFinish.getTime() > slotStart.getTime()
            ? latestKeptFinish
            : slotStart
      }

      // Serialize delayed tasks so they don't overlap each other.
      for (const task of toDelay) {
        // Skip hard-constrained tasks
        if (task.constraintType === 'mustStartOn' || task.constraintType === 'mustFinishOn') {
          continue
        }

        const currentTask = byId.get(task.id)
        if (!currentTask) continue

        let newStart = calendar.snapToWorkStart(new Date(slotStart.getTime()))
        if (newStart.getTime() <= currentTask.start.getTime()) {
          // Force past the current day end
          const nextDay = new Date(dayEnd.getTime())
          newStart = calendar.snapToWorkStart(nextDay)
          // If still not ahead, advance one more working day
          if (newStart.getTime() <= currentTask.start.getTime()) {
            newStart = calendar.snapToWorkStart(
              calendar.addWorkingHours(currentTask.start, 8),
            )
          }
        }

        if (newStart.getTime() <= currentTask.start.getTime()) continue

        const oldStart = currentTask.start
        const durationHours = currentTask.milestone
          ? 0
          : Math.max(0, currentTask.duration.toHours())
        const newFinish =
          durationHours === 0
            ? newStart
            : calendar.addWorkingHours(newStart, durationHours)

        const updatedTask = currentTask.with({
          start: newStart,
          finish: newFinish,
        })

        const idx = working.findIndex((t) => t.id === task.id)
        if (idx >= 0) working[idx] = updatedTask
        byId.set(task.id, updatedTask)

        // Update slotStart for next delayed task
        slotStart = newFinish

        const delayHours =
          (newStart.getTime() - oldStart.getTime()) / 3_600_000

        // Update or create leveled entry
        const existing = leveledMap.get(task.id)
        leveledMap.set(task.id, {
          taskId: task.id,
          name: task.name,
          oldStart: existing?.oldStart ?? oldStart,
          newStart,
          delayHours: existing ? existing.delayHours + delayHours : delayHours,
        })

        anyProgress = true

        // Cascade to successors
        cascadeDelay(
          task.id,
          newFinish,
          working,
          successors,
          calendar,
          leveledMap,
          scope,
        )
      }
    }

    cursor.setDate(cursor.getDate() + 1)

    // Refresh endDate if tasks were pushed out
    const newEnd = computeFinish(working)
    if (newEnd.getTime() > endDate.getTime()) {
      endDate = newEnd
    }
  }

  return { tasks: working, anyProgress }
}

function cascadeDelay(
  predecessorId: TaskId,
  predFinish: Date,
  working: Task[],
  successors: Map<TaskId, TaskId[]>,
  calendar: WorkCalendar,
  leveledMap: Map<TaskId, LeveledTask>,
  scope: Set<TaskId>,
): void {
  const succIds = successors.get(predecessorId)
  if (!succIds || succIds.length === 0) return

  const byId = new Map(working.map((t) => [t.id, t]))

  const cascadeOne = (id: TaskId, earliestStart: Date) => {
    const task = byId.get(id)
    if (!task || task.summary) return

    if (task.constraintType === 'mustStartOn' || task.constraintType === 'mustFinishOn') return

    if (earliestStart.getTime() > task.start.getTime()) {
      const oldStart = task.start
      const durationHours = task.milestone ? 0 : Math.max(0, task.duration.toHours())
      const newFinish =
        durationHours === 0
          ? earliestStart
          : calendar.addWorkingHours(earliestStart, durationHours)

      const updated = task.with({
        start: earliestStart,
        finish: newFinish,
      })

      const idx = working.findIndex((t) => t.id === id)
      if (idx >= 0) working[idx] = updated
      byId.set(id, updated)

      const delayHours =
        (earliestStart.getTime() - oldStart.getTime()) / 3_600_000

      const existing = leveledMap.get(id)
      leveledMap.set(id, {
        taskId: id,
        name: task.name,
        oldStart: existing?.oldStart ?? oldStart,
        newStart: earliestStart,
        delayHours: existing ? existing.delayHours + delayHours : delayHours,
      })

      // Cascade further
      const nextSuccs = successors.get(id)
      if (nextSuccs) {
        for (const nextId of nextSuccs) {
          cascadeOne(nextId, calendar.snapToWorkStart(newFinish))
        }
      }
    }
  }

  const snapped = calendar.snapToWorkStart(predFinish)
  for (const succId of succIds) {
    cascadeOne(succId, snapped)
  }
}

/**
 * Count the number of resource-period overallocations across the project.
 * Each resource-day where assigned > max counts as one overallocation.
 */
function countOverallocations(
  tasks: readonly Task[],
  resources: readonly Resource[],
  assignments: readonly Assignment[],
  calendar: WorkCalendar,
): number {
  const nonSummary = tasks.filter((t) => !t.summary && t.duration.toHours() > 0)
  if (nonSummary.length === 0) return 0

  const startDate = new Date(
    Math.min(...nonSummary.map((t) => t.start.getTime())),
  )
  const endDate = new Date(
    Math.max(...nonSummary.map((t) => t.finish.getTime())),
  )

  const resourceById = new Map(resources.map((r) => [r.id, r]))
  const assignmentsByTask = new Map<TaskId, Assignment[]>()
  for (const a of assignments) {
    const list = assignmentsByTask.get(a.taskId) ?? []
    list.push(a)
    assignmentsByTask.set(a.taskId, list)
  }

  let count = 0
  const cursor = new Date(startDate.getTime())
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(endDate.getTime())
  end.setHours(0, 0, 0, 0)

  let dayCount = 0
  while (cursor.getTime() <= end.getTime() && dayCount < 3650) {
    dayCount += 1
    const dayStart = new Date(cursor.getTime())
    const dayEnd = new Date(cursor.getTime())
    dayEnd.setDate(dayEnd.getDate() + 1)

    if (!calendar.isWorkingDay(dayStart)) {
      cursor.setDate(cursor.getDate() + 1)
      continue
    }

    const active = nonSummary.filter(
      (t) =>
        t.start.getTime() < dayEnd.getTime() &&
        t.finish.getTime() > dayStart.getTime(),
    )

    const perResource = new Map<string, number>()
    for (const task of active) {
      const taskAssignments = assignmentsByTask.get(task.id) ?? []
      for (const a of taskAssignments) {
        const current = perResource.get(a.resourceId) ?? 0
        perResource.set(a.resourceId, current + a.units)
      }
    }

    for (const [resId, units] of perResource) {
      const resource = resourceById.get(resId)
      if (resource && units > resource.maxUnits) {
        count += 1
      }
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return count
}

function computeFinish(tasks: readonly Task[]): Date {
  if (tasks.length === 0) return new Date()
  return new Date(Math.max(...tasks.map((t) => t.finish.getTime())))
}
