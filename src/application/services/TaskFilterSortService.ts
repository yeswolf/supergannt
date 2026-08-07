import type { Project } from '../../domain/entities/Project'
import type { Task } from '../../domain/entities/Task'
import type { TaskColumnId } from '../../presentation/taskColumns/taskColumnDefs'
import { formatTaskResourceNames } from '../use-cases/ResourceUseCases'

// ── Filter types ──────────────────────────────────────────────────────

export interface TextFilter {
  type: 'textContains' | 'textEquals'
  value: string
}

export interface NumericRangeFilter {
  type: 'numericRange'
  min?: number
  max?: number
}

export interface DateRangeFilter {
  type: 'dateRange'
  from?: string
  to?: string
}

export interface BooleanFilter {
  type: 'boolean'
  value: boolean
}

export interface ResourceNameFilter {
  type: 'resourceName'
  value: string
}

export type FilterValue =
  | TextFilter
  | NumericRangeFilter
  | DateRangeFilter
  | BooleanFilter
  | ResourceNameFilter

export interface ColumnFilter {
  id: string
  column: TaskColumnId
  filter: FilterValue
}

// ── Sort ───────────────────────────────────────────────────────────────

export interface TaskSort {
  column: TaskColumnId
  direction: 'asc' | 'desc'
}

// ── Grouping ───────────────────────────────────────────────────────────

export type TaskGroupField = 'resource' | 'status' | 'outlineLevel' | 'none'

// ── View model ─────────────────────────────────────────────────────────

export interface GroupHeaderRow {
  type: 'groupHeader'
  groupLabel: string
  groupKey: string
  cost: string
  workHours: number
  taskCount: number
}

export interface TaskRow {
  type: 'task'
  task: Task
}

export type TaskViewRow = GroupHeaderRow | TaskRow

// ── State ──────────────────────────────────────────────────────────────

export interface TaskFilterSortState {
  filters: ColumnFilter[]
  sort: TaskSort | null
  groupBy: TaskGroupField
}

export function createInitialFilterSortState(): TaskFilterSortState {
  return {
    filters: [],
    sort: null,
    groupBy: 'none',
  }
}

// ── Constants ──────────────────────────────────────────────────────────

/** Sentinel value returned for null/undefined slack hours so the value
 *  is always a number for sort/filter dispatch. Filter and sort functions
 *  must explicitly skip this sentinel to avoid false matches. */
export const NULL_SLACK_SENTINEL = -9999

// ── Filter matching ────────────────────────────────────────────────────

function textContains(task: Task, column: TaskColumnId, value: string): boolean {
  const fieldValue = getTaskFieldValue(task, column)
  return String(fieldValue).toLowerCase().includes(value.toLowerCase())
}

function textEquals(task: Task, column: TaskColumnId, value: string): boolean {
  const fieldValue = getTaskFieldValue(task, column)
  return String(fieldValue).toLowerCase() === value.toLowerCase()
}

function numericRange(
  task: Task,
  column: TaskColumnId,
  min?: number,
  max?: number,
): boolean {
  const raw = getTaskFieldValue(task, column)
  const val = typeof raw === 'number' ? raw : Number(raw)
  if (isNaN(val)) return false
  // Skip tasks with no slack data — the sentinel is not a real value
  if (val === NULL_SLACK_SENTINEL) return false
  if (min !== undefined && val < min) return false
  if (max !== undefined && val > max) return false
  return true
}

function dateRange(
  task: Task,
  column: TaskColumnId,
  from?: string,
  to?: string,
): boolean {
  const raw = getTaskFieldValue(task, column)
  if (!(raw instanceof Date)) return false
  const val = raw.getTime()
  if (from) {
    const fromMs = new Date(from + 'T00:00:00').getTime()
    if (val < fromMs) return false
  }
  if (to) {
    const toMs = new Date(to + 'T00:00:00').getTime()
    if (val > toMs + 86_399_999) return false
  }
  return true
}

function matchesBoolean(
  project: Project,
  task: Task,
  column: TaskColumnId,
  value: boolean,
): boolean {
  if (column === 'resources') {
    const hasResources = formatTaskResourceNames(project, task.id).trim().length > 0
    return hasResources === value
  }
  const raw = getTaskFieldValue(task, column)
  return Boolean(raw) === value
}

function matchesResourceName(
  project: Project,
  task: Task,
  value: string,
): boolean {
  const names = formatTaskResourceNames(project, task.id)
  return names.toLowerCase().includes(value.toLowerCase())
}

/** Extract a primitive value from a task for a given column. */
function getTaskFieldValue(
  task: Task,
  column: TaskColumnId,
): string | number | boolean | Date {
  switch (column) {
    case 'id':
      return task.wbs
    case 'wbs':
      return task.wbs
    case 'name':
      return task.name
    case 'duration':
      return task.duration.toHours()
    case 'percent':
      return task.percentComplete
    case 'start':
      return task.start
    case 'finish':
      return task.finish
    case 'totalSlack':
      return task.totalSlackHours ?? NULL_SLACK_SENTINEL
    case 'freeSlack':
      return task.freeSlackHours ?? NULL_SLACK_SENTINEL
    case 'cost':
      return task.cost.amount
    case 'resources':
      return ''
    case 'predecessors':
      return ''
    case 'milestone':
      return task.milestone
    case 'critical':
      return task.critical
    case 'summary':
      return task.summary
  }
}

function taskMatchesFilter(
  project: Project,
  task: Task,
  filter: ColumnFilter,
): boolean {
  const f = filter.filter
  switch (f.type) {
    case 'textContains':
      return textContains(task, filter.column, f.value)
    case 'textEquals':
      return textEquals(task, filter.column, f.value)
    case 'numericRange':
      return numericRange(task, filter.column, f.min, f.max)
    case 'dateRange':
      return dateRange(task, filter.column, f.from, f.to)
    case 'boolean':
      return matchesBoolean(project, task, filter.column, f.value)
    case 'resourceName':
      return matchesResourceName(project, task, f.value)
  }
}

// ── Public API ─────────────────────────────────────────────────────────

/** Apply filters, sort, and grouping to produce the derived view model. */
export function applyTaskFilterSort(
  project: Project,
  state: TaskFilterSortState,
): TaskViewRow[] {
  // 1. Filter
  let filtered: Task[] = [...project.tasks]
  if (state.filters.length > 0) {
    filtered = filtered.filter((task) =>
      state.filters.every((f) => taskMatchesFilter(project, task, f)),
    )
  }

  // 2. Sort
  if (state.sort) {
    filtered = sortTasks(filtered, state.sort)
  }

  // 3. Group
  if (state.groupBy === 'none') {
    return filtered.map((task) => ({ type: 'task' as const, task }))
  }

  return groupTasks(project, filtered, state.groupBy)
}

/** Return only the filtered task list (no grouping). */
export function applyTaskFilter(
  project: Project,
  state: TaskFilterSortState,
): Task[] {
  let tasks: Task[] = [...project.tasks]
  if (state.filters.length > 0) {
    tasks = tasks.filter((task) =>
      state.filters.every((f) => taskMatchesFilter(project, task, f)),
    )
  }
  if (state.sort) {
    tasks = sortTasks(tasks, state.sort)
  }
  return tasks
}

// ── Sort ───────────────────────────────────────────────────────────────

function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  return [...tasks].sort((a, b) => {
    const va = getTaskFieldValue(a, sort.column)
    const vb = getTaskFieldValue(b, sort.column)

    // Push null-slack sentinel values to the bottom regardless of direction
    const aIsSentinel = va === NULL_SLACK_SENTINEL
    const bIsSentinel = vb === NULL_SLACK_SENTINEL
    if (aIsSentinel && !bIsSentinel) return 1
    if (!aIsSentinel && bIsSentinel) return -1
    if (aIsSentinel && bIsSentinel) return 0

    let cmp: number
    if (va instanceof Date && vb instanceof Date) {
      cmp = va.getTime() - vb.getTime()
    } else if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb
    } else {
      cmp = String(va).localeCompare(String(vb), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    }
    return sort.direction === 'asc' ? cmp : -cmp
  })
}

// ── Grouping ───────────────────────────────────────────────────────────

function groupTasks(
  project: Project,
  tasks: Task[],
  field: TaskGroupField,
): TaskViewRow[] {
  const groups = new Map<string, Task[]>()

  for (const task of tasks) {
    const key = getGroupKey(project, task, field)
    const list = groups.get(key) ?? []
    list.push(task)
    groups.set(key, list)
  }

  // Stable sort groups by key for outlineLevel (numeric), else alpha
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (field === 'outlineLevel') {
      return Number(a) - Number(b)
    }
    return a.localeCompare(b)
  })

  const rows: TaskViewRow[] = []
  for (const key of sortedKeys) {
    const groupTasks = groups.get(key)!
    const label = getGroupLabel(field, key, groupTasks[0])
    rows.push(makeGroupHeader(label, key, groupTasks))
    for (const task of groupTasks) {
      rows.push({ type: 'task', task })
    }
  }
  return rows
}

export function getGroupKey(
  project: Project,
  task: Task,
  field: TaskGroupField,
): string {
  switch (field) {
    case 'resource': {
      const names = formatTaskResourceNames(project, task.id)
      return names.trim() || '(Unassigned)'
    }
    case 'status': {
      if (task.percentComplete === 0) return 'Not Started'
      if (task.percentComplete === 100) return 'Complete'
      if (task.finish.getTime() < Date.now()) return 'Late'
      return 'In Progress'
    }
    case 'outlineLevel':
      return String(task.outlineLevel)
    case 'none':
      return ''
  }
}

function getGroupLabel(
  field: TaskGroupField,
  key: string,
  exampleTask: Task,
): string {
  switch (field) {
    case 'resource':
      return key
    case 'status':
      return key
    case 'outlineLevel':
      return `Outline Level ${key}`
    default:
      return key
  }
}

function makeGroupHeader(
  label: string,
  key: string,
  tasks: Task[],
): GroupHeaderRow {
  let costAmount = 0
  let workHours = 0
  const currency = tasks.length > 0 ? tasks[0]!.cost.currency : 'USD'
  for (const task of tasks) {
    costAmount += task.cost.amount
    workHours += task.workHours
  }
  const fmtCost = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(costAmount)
  return {
    type: 'groupHeader',
    groupLabel: label,
    groupKey: key,
    cost: fmtCost,
    workHours,
    taskCount: tasks.length,
  }
}
