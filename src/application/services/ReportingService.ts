import type { Project } from '../../domain/entities/Project'
import { computeResourceUtilization } from '../../domain/services/CostService'

export interface NetworkNode {
  id: string
  name: string
  earlyStart: string
  earlyFinish: string
  critical: boolean
  milestone: boolean
}

export interface NetworkEdge {
  id: string
  from: string
  to: string
  type: string
}

export function toNetworkDiagram(project: Project): {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
} {
  const nodes = project.tasks
    .filter((t) => !t.summary)
    .map((t) => ({
      id: t.id,
      name: t.name,
      earlyStart: t.start.toISOString().slice(0, 10),
      earlyFinish: t.finish.toISOString().slice(0, 10),
      critical: t.critical,
      milestone: t.milestone,
    }))

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = project.dependencies
    .filter((d) => nodeIds.has(d.predecessorId) && nodeIds.has(d.successorId))
    .map((d) => ({
      id: d.id,
      from: d.predecessorId,
      to: d.successorId,
      type: d.type,
    }))

  return { nodes, edges }
}

export function toResourceSheet(project: Project) {
  return computeResourceUtilization(
    project.resources,
    project.assignments,
    project.tasks,
    project.currency,
  )
}

export interface EarnedValueSnapshot {
  plannedValue: number
  earnedValue: number
  actualCost: number
  scheduleVariance: number
  costVariance: number
  spi: number
  cpi: number
}

export function computeEarnedValue(project: Project): EarnedValueSnapshot {
  const tasks = project.tasks.filter((t) => !t.summary)
  const budget = tasks.reduce((s, t) => s + t.cost.amount, 0) || 1
  const plannedValue = tasks.reduce((s, t) => {
    const baselineCost = t.baseline?.cost.amount ?? t.cost.amount
    return s + baselineCost
  }, 0)
  const earnedValue = tasks.reduce(
    (s, t) => s + (t.baseline?.cost.amount ?? t.cost.amount) * (t.percentComplete / 100),
    0,
  )
  const actualCost = tasks.reduce(
    (s, t) => s + t.cost.amount * (t.percentComplete / 100),
    0,
  )
  return {
    plannedValue,
    earnedValue,
    actualCost,
    scheduleVariance: earnedValue - plannedValue,
    costVariance: earnedValue - actualCost,
    spi: plannedValue === 0 ? 1 : earnedValue / plannedValue,
    cpi: actualCost === 0 ? 1 : earnedValue / actualCost,
    // budget kept for potential reports
    ...(budget > 0 ? {} : {}),
  }
}

// ── Resource Histogram ────────────────────────────────────────────

export type HistogramGranularity = 'day' | 'week' | 'month'

export interface PeriodBucket {
  periodStart: string
  resourceId: string
  resourceName: string
  allocatedHours: number
  capacityHours: number
  overallocated: boolean
  taskIds: string[]
}

/** Hours in a standard working day. */
const WORKING_HOURS_PER_DAY = 8

/** Return the ISO Monday of the week containing `date`. */
function mondayOf(date: Date): Date {
  const d = new Date(date.getTime())
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Return the first day of the month containing `date`. */
function firstOfMonth(date: Date): Date {
  const d = new Date(date.getTime())
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Return the start of the day. */
function startOfDay(date: Date): Date {
  const d = new Date(date.getTime())
  d.setHours(0, 0, 0, 0)
  return d
}

function localIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getPeriodKey(date: Date, granularity: HistogramGranularity): string {
  if (granularity === 'day') return localIso(startOfDay(date))
  if (granularity === 'week') return localIso(mondayOf(date))
  return localIso(firstOfMonth(date))
}

/**
 * Compute time-phased allocation for every resource across the project timeline.
 *
 * For each non-summary, non-milestone task with assignments, the task's work
 * hours are spread evenly across its working days.  The resulting daily hours
 * per resource are rolled up into period buckets (day / week / month) defined
 * by `granularity`.
 */
export function computeResourceHistogram(
  project: Project,
  granularity: HistogramGranularity = 'week',
): PeriodBucket[] {
  const calendar = project.getCalendar()

  // Intermediate map: resourceId → periodKey → { hours, taskIds }
  const accumulator = new Map<string, Map<string, { hours: number; taskIds: Set<string> }>>()

  for (const task of project.tasks) {
    if (task.summary || task.milestone) continue

    const assignments = project.assignments.filter((a) => a.taskId === task.id)
    if (assignments.length === 0) continue

    const workingDays: Date[] = []
    const cursor = new Date(task.start.getTime())
    cursor.setHours(0, 0, 0, 0)
    const end = new Date(task.finish.getTime())
    end.setHours(0, 0, 0, 0)
    while (cursor.getTime() <= end.getTime()) {
      if (calendar.isWorkingDay(cursor)) {
        workingDays.push(new Date(cursor.getTime()))
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    if (workingDays.length === 0) continue

    for (const assignment of assignments) {
      const resource = project.resources.find((r) => r.id === assignment.resourceId)
      if (!resource) continue

      const hours =
        assignment.workHours > 0
          ? assignment.workHours
          : task.duration.toHours() * assignment.units
      const perDay = hours / workingDays.length

      for (const day of workingDays) {
        const periodKey = getPeriodKey(day, granularity)

        let inner = accumulator.get(resource.id)
        if (!inner) {
          inner = new Map()
          accumulator.set(resource.id, inner)
        }

        let entry = inner.get(periodKey)
        if (!entry) {
          entry = { hours: 0, taskIds: new Set() }
          inner.set(periodKey, entry)
        }
        entry.hours += perDay
        entry.taskIds.add(task.id)
      }
    }
  }

  // Build result
  const buckets: PeriodBucket[] = []
  for (const resource of project.resources) {
    const capacityPerDay = resource.maxUnits * WORKING_HOURS_PER_DAY
    const inner = accumulator.get(resource.id)
    if (!inner || inner.size === 0) continue

    for (const [periodStart, entry] of inner) {
      // Determine working days in this period for the resource's calendar
      const resCalendar = project.getResourceCalendar(resource.id)
      const periodStartDate = new Date(periodStart + 'T00:00:00')
      let workingDaysInPeriod = 0

      const cursor = new Date(periodStartDate.getTime())
      const periodEnd = new Date(periodStartDate.getTime())
      if (granularity === 'day') {
        periodEnd.setDate(periodEnd.getDate() + 1)
      } else if (granularity === 'week') {
        periodEnd.setDate(periodEnd.getDate() + 7)
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1)
      }

      while (cursor.getTime() < periodEnd.getTime()) {
        if (resCalendar.isWorkingDay(cursor)) {
          workingDaysInPeriod++
        }
        cursor.setDate(cursor.getDate() + 1)
      }

      const capacityHours = workingDaysInPeriod * capacityPerDay

      buckets.push({
        periodStart,
        resourceId: resource.id,
        resourceName: resource.name,
        allocatedHours: entry.hours,
        capacityHours,
        overallocated: entry.hours > capacityHours + 0.01,
        taskIds: [...entry.taskIds],
      })
    }
  }

  return buckets.sort((a, b) =>
    a.periodStart === b.periodStart
      ? a.resourceName.localeCompare(b.resourceName)
      : a.periodStart.localeCompare(b.periodStart),
  )
}
