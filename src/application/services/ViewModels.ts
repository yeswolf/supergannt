import type { Project } from '../../domain/entities/Project'
import type { Resource } from '../../domain/entities/Resource'
import type { Task } from '../../domain/entities/Task'

export interface WbsNode {
  id: string
  wbs: string
  name: string
  outlineLevel: number
  summary: boolean
  milestone: boolean
  critical: boolean
  start: string
  finish: string
  durationDays: number
  durationHours: number
  percentComplete: number
  children: WbsNode[]
}

export interface RbsNode {
  id: string
  name: string
  type: string
  group: string
  maxUnits: number
  assignedUnits: number
  taskCount: number
  children: RbsNode[]
}

export interface UsageCell {
  date: string
  hours: number
}

export interface TaskUsageRow {
  taskId: string
  taskName: string
  wbs: string
  resourceId: string | null
  resourceName: string
  totalHours: number
  cells: UsageCell[]
}

export interface ResourceUsageRow {
  resourceId: string
  resourceName: string
  taskId: string | null
  taskName: string
  totalHours: number
  cells: UsageCell[]
  overallocated: boolean
}

export interface HistogramBucket {
  date: string
  resourceId: string
  resourceName: string
  hours: number
  capacity: number
  overallocated: boolean
}

function localIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function eachWorkingDay(
  start: Date,
  finish: Date,
  isWorking: (d: Date) => boolean,
): Date[] {
  const days: Date[] = []
  const cursor = new Date(start.getTime())
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(finish.getTime())
  end.setHours(0, 0, 0, 0)
  while (cursor.getTime() <= end.getTime()) {
    if (isWorking(cursor)) days.push(new Date(cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function buildWbsTree(project: Project): WbsNode[] {
  const nodes = project.tasks.map<WbsNode>((t) => ({
    id: t.id,
    wbs: t.wbs,
    name: t.name,
    outlineLevel: t.outlineLevel,
    summary: t.summary,
    milestone: t.milestone,
    critical: t.critical,
    start: localIso(t.start),
    finish: localIso(t.finish),
    durationDays: t.duration.toDays(),
      durationHours: t.duration.toHours(),
      percentComplete: t.percentComplete,
    children: [],
  }))
  const roots: WbsNode[] = []
  const stack: WbsNode[] = []
  for (const node of nodes) {
    while (stack.length > 0 && stack[stack.length - 1]!.outlineLevel >= node.outlineLevel) {
      stack.pop()
    }
    if (stack.length === 0) roots.push(node)
    else stack[stack.length - 1]!.children.push(node)
    stack.push(node)
  }
  return roots
}

export function buildRbsTree(project: Project): RbsNode[] {
  const byGroup = new Map<string, Resource[]>()
  for (const resource of project.resources) {
    const group = resource.group.trim() || 'Ungrouped'
    const list = byGroup.get(group) ?? []
    list.push(resource)
    byGroup.set(group, list)
  }

  const roots: RbsNode[] = []
  for (const [group, resources] of byGroup) {
    const children = resources.map((resource) => {
      const assignments = project.assignments.filter((a) => a.resourceId === resource.id)
      const assignedUnits = assignments.reduce((s, a) => s + a.units, 0)
      return {
        id: resource.id,
        name: resource.name,
        type: resource.type,
        group: resource.group,
        maxUnits: resource.maxUnits,
        assignedUnits,
        taskCount: assignments.length,
        children: [],
      }
    })
    roots.push({
      id: `group:${group}`,
      name: group,
      type: 'group',
      group,
      maxUnits: children.reduce((s, c) => s + c.maxUnits, 0),
      assignedUnits: children.reduce((s, c) => s + c.assignedUnits, 0),
      taskCount: children.reduce((s, c) => s + c.taskCount, 0),
      children,
    })
  }
  return roots
}

function hoursForAssignment(
  task: Task,
  units: number,
  workHours: number,
): number {
  if (workHours > 0) return workHours
  return task.duration.toHours() * units
}

export function buildTaskUsage(project: Project): TaskUsageRow[] {
  const calendar = project.getCalendar()
  const rows: TaskUsageRow[] = []
  for (const task of project.tasks.filter((t) => !t.summary)) {
    const assignments = project.assignments.filter((a) => a.taskId === task.id)
    if (assignments.length === 0) {
      const days = eachWorkingDay(task.start, task.finish, (d) => calendar.isWorkingDay(d))
      const hours = task.milestone ? 0 : task.duration.toHours()
      const perDay = days.length === 0 ? 0 : hours / days.length
      rows.push({
        taskId: task.id,
        taskName: task.name,
        wbs: task.wbs,
        resourceId: null,
        resourceName: '(Unassigned)',
        totalHours: hours,
        cells: days.map((d) => ({ date: localIso(d), hours: perDay })),
      })
      continue
    }
    for (const assignment of assignments) {
      const resource = project.resources.find((r) => r.id === assignment.resourceId)
      const days = eachWorkingDay(task.start, task.finish, (d) => calendar.isWorkingDay(d))
      const total = hoursForAssignment(task, assignment.units, assignment.workHours)
      const perDay = days.length === 0 ? 0 : total / days.length
      rows.push({
        taskId: task.id,
        taskName: task.name,
        wbs: task.wbs,
        resourceId: assignment.resourceId,
        resourceName: resource?.name ?? 'Unknown',
        totalHours: total,
        cells: days.map((d) => ({ date: localIso(d), hours: perDay })),
      })
    }
  }
  return rows
}

export function buildResourceUsage(project: Project): ResourceUsageRow[] {
  const calendar = project.getCalendar()
  const rows: ResourceUsageRow[] = []
  for (const resource of project.resources) {
    const assignments = project.assignments.filter((a) => a.resourceId === resource.id)
    if (assignments.length === 0) {
      rows.push({
        resourceId: resource.id,
        resourceName: resource.name,
        taskId: null,
        taskName: '(No assignments)',
        totalHours: 0,
        cells: [],
        overallocated: false,
      })
      continue
    }
    const dayTotals = new Map<string, number>()
    for (const assignment of assignments) {
      const task = project.getTask(assignment.taskId)
      if (!task || task.summary) continue
      const days = eachWorkingDay(task.start, task.finish, (d) => calendar.isWorkingDay(d))
      const total = hoursForAssignment(task, assignment.units, assignment.workHours)
      const perDay = days.length === 0 ? 0 : total / days.length
      for (const d of days) {
        const key = localIso(d)
        dayTotals.set(key, (dayTotals.get(key) ?? 0) + perDay)
      }
      rows.push({
        resourceId: resource.id,
        resourceName: resource.name,
        taskId: task.id,
        taskName: task.name,
        totalHours: total,
        cells: days.map((d) => ({ date: localIso(d), hours: perDay })),
        overallocated: false,
      })
    }
    const capacity = resource.maxUnits * 8
    const over = [...dayTotals.values()].some((h) => h > capacity + 0.01)
    for (const row of rows) {
      if (row.resourceId === resource.id) row.overallocated = over
    }
  }
  return rows
}

export function buildResourceHistogram(project: Project): HistogramBucket[] {
  const usage = buildResourceUsage(project)
  const byKey = new Map<string, HistogramBucket>()
  for (const row of usage) {
    const resource = project.resources.find((r) => r.id === row.resourceId)
    const capacity = (resource?.maxUnits ?? 1) * 8
    for (const cell of row.cells) {
      const key = `${row.resourceId}|${cell.date}`
      const existing = byKey.get(key)
      if (existing) {
        existing.hours += cell.hours
        existing.overallocated = existing.hours > capacity + 0.01
      } else {
        byKey.set(key, {
          date: cell.date,
          resourceId: row.resourceId,
          resourceName: row.resourceName,
          hours: cell.hours,
          capacity,
          overallocated: cell.hours > capacity + 0.01,
        })
      }
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.date === b.date
      ? a.resourceName.localeCompare(b.resourceName)
      : a.date.localeCompare(b.date),
  )
}
