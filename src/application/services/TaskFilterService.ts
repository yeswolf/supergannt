import type { Project } from '../../domain/entities/Project'
import type { Task } from '../../domain/entities/Task'
import type { TaskColumnId } from '../../presentation/taskColumns/taskColumnDefs'
import { formatTaskResourceNames } from '../use-cases/ResourceUseCases'
import { formatPredecessors } from './PredecessorNotation'
import { Money } from '../../domain/value-objects/Money'

// ── Filter types ────────────────────────────────────────────────

export type FilterField =
  | TaskColumnId
  | 'milestone'
  | 'critical'
  | 'summary'
  | 'outlineLevel'

export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'notEquals'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'

export interface ColumnFilter {
  field: FilterField
  operator: FilterOperator
  value: string | number | boolean
}

// ── Sort types ──────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc'

export interface SortSpec {
  field: FilterField
  direction: SortDirection
}

// ── Group types ─────────────────────────────────────────────────

export type GroupByField = 'resource' | 'status' | 'outlineLevel' | 'none'

export interface TaskGroup {
  key: string
  label: string
  taskIds: string[]
  /** Precomputed group totals. */
  totalCost: Money
  totalWorkHours: number
  collapsed: boolean
}

export interface DerivedTaskView {
  orderedTasks: Task[]
  groups: TaskGroup[]
  groupIndex: Map<string, number>
  activeFilterCount: number
  activeSortCount: number
}

// ── Filter state (serialisable) ─────────────────────────────────

export interface FilterState {
  filters: ColumnFilter[]
  sorts: SortSpec[]
  groupBy: GroupByField
  collapsedGroups: string[]
}

export const DEFAULT_FILTER_STATE: FilterState = {
  filters: [],
  sorts: [],
  groupBy: 'none',
  collapsedGroups: [],
}

// ── Field accessors ─────────────────────────────────────────────

function getFieldValue(
  task: Task,
  project: Project,
  field: FilterField,
): string | number | boolean {
  switch (field) {
    case 'id':
      return task.id
    case 'wbs':
      return task.wbs
    case 'name':
      return task.name
    case 'duration':
      return task.duration.toHours()
    case 'percent':
      return task.percentComplete
    case 'start':
      return task.start.getTime()
    case 'finish':
      return task.finish.getTime()
    case 'cost':
      return task.cost.amount
    case 'resources':
      return formatTaskResourceNames(project, task.id)
    case 'predecessors':
      return formatPredecessors(project, task.id)
    case 'milestone':
      return task.milestone
    case 'critical':
      return task.critical
    case 'summary':
      return task.summary
    case 'outlineLevel':
      return task.outlineLevel
  }
}

// ── Filter matching ─────────────────────────────────────────────

function taskMatchesFilter(
  task: Task,
  project: Project,
  filter: ColumnFilter,
): boolean {
  const raw = getFieldValue(task, project, filter.field)
  const fv = filter.value

  switch (filter.operator) {
    case 'contains': {
      const haystack = String(raw).toLowerCase()
      const needle = String(fv).toLowerCase()
      return haystack.includes(needle)
    }
    case 'equals': {
      if (typeof raw === 'boolean') return raw === Boolean(fv)
      return String(raw).toLowerCase() === String(fv).toLowerCase()
    }
    case 'notEquals': {
      if (typeof raw === 'boolean') return raw !== Boolean(fv)
      return String(raw).toLowerCase() !== String(fv).toLowerCase()
    }
    case 'gt':
      return Number(raw) > Number(fv)
    case 'lt':
      return Number(raw) < Number(fv)
    case 'gte':
      return Number(raw) >= Number(fv)
    case 'lte':
      return Number(raw) <= Number(fv)
  }
}

export function applyFilters(
  tasks: readonly Task[],
  project: Project,
  filters: ColumnFilter[],
): Task[] {
  if (filters.length === 0) return [...tasks]
  return tasks.filter((task) =>
    filters.every((f) => taskMatchesFilter(task, project, f)),
  )
}

// ── Sorting ─────────────────────────────────────────────────────

export function applySorts(
  tasks: Task[],
  project: Project,
  sorts: SortSpec[],
): Task[] {
  if (sorts.length === 0) return tasks

  return [...tasks].sort((a, b) => {
    for (const sort of sorts) {
      const av = getFieldValue(a, project, sort.field)
      const bv = getFieldValue(b, project, sort.field)
      let cmp = 0

      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv, undefined, { numeric: true })
      } else {
        cmp = Number(av) - Number(bv)
      }

      if (cmp !== 0) {
        return sort.direction === 'asc' ? cmp : -cmp
      }
    }
    return 0
  })
}

// ── Grouping ────────────────────────────────────────────────────

function getGroupKey(
  task: Task,
  project: Project,
  groupBy: GroupByField,
): string {
  switch (groupBy) {
    case 'resource': {
      const names = formatTaskResourceNames(project, task.id)
      return names || '(Unassigned)'
    }
    case 'status': {
      if (task.milestone) return 'Milestone'
      if (task.summary) return 'Summary'
      if (task.percentComplete === 0) return 'Not Started'
      if (task.percentComplete >= 100) return 'Complete'
      return 'In Progress'
    }
    case 'outlineLevel':
      return `Level ${task.outlineLevel}`
    case 'none':
      return ''
  }
}

export function buildGroups(
  tasks: Task[],
  project: Project,
  groupBy: GroupByField,
  collapsedKeys: string[],
): TaskGroup[] {
  if (groupBy === 'none') return []

  const map = new Map<string, Task[]>()
  const insertionOrder: string[] = []

  for (const task of tasks) {
    const key = getGroupKey(task, project, groupBy)
    if (!map.has(key)) {
      map.set(key, [])
      insertionOrder.push(key)
    }
    map.get(key)!.push(task)
  }

  return insertionOrder.map((key) => {
    const groupTasks = map.get(key)!
    let totalCost = Money.zero(project.currency)
    let totalWorkHours = 0
    for (const t of groupTasks) {
      totalCost = totalCost.add(t.cost)
      totalWorkHours += t.workHours
    }
    return {
      key,
      label: key,
      taskIds: groupTasks.map((t) => t.id),
      totalCost,
      totalWorkHours,
      collapsed: collapsedKeys.includes(key),
    }
  })
}

// ── Derived view ────────────────────────────────────────────────

export function deriveTaskView(
  project: Project,
  state: FilterState,
): DerivedTaskView {
  const filtered = applyFilters(project.tasks, project, state.filters)
  const sorted = applySorts(filtered, project, state.sorts)
  const groups = buildGroups(sorted, project, state.groupBy, state.collapsedGroups)

  const groupIndex = new Map<string, number>()
  for (let i = 0; i < groups.length; i++) {
    for (const taskId of groups[i]!.taskIds) {
      groupIndex.set(taskId, i)
    }
  }

  return {
    orderedTasks: sorted,
    groups,
    groupIndex,
    activeFilterCount: state.filters.length,
    activeSortCount: state.sorts.length,
  }
}

// ── Flatten for rendering ───────────────────────────────────────

export type TaskSheetRow =
  | { type: 'group'; group: TaskGroup }
  | { type: 'task'; task: Task }

export function flattenForRendering(view: DerivedTaskView): TaskSheetRow[] {
  if (view.groups.length === 0) {
    return view.orderedTasks.map((task) => ({ type: 'task' as const, task }))
  }

  const rows: TaskSheetRow[] = []
  const collapsed = new Set(
    view.groups.filter((g) => g.collapsed).map((g) => g.key),
  )

  for (const group of view.groups) {
    rows.push({ type: 'group' as const, group })
    if (!collapsed.has(group.key)) {
      for (const taskId of group.taskIds) {
        const task = view.orderedTasks.find((t) => t.id === taskId)
        if (task) rows.push({ type: 'task' as const, task })
      }
    }
  }

  return rows
}

// ── Sort toggle helpers ─────────────────────────────────────────

export function toggleSort(
  current: SortSpec[],
  field: FilterField,
  additive: boolean,
): SortSpec[] {
  const existing = current.find((s) => s.field === field)

  if (!additive) {
    if (!existing) return [{ field, direction: "asc" as const }]
    if (existing.direction === "asc") return [{ field, direction: "desc" as const }]
    return []
  }

  // Multi-column: cycle through asc to desc to remove
  const rest = current.filter((s) => s.field !== field)
  if (!existing) return rest.concat([{ field, direction: "asc" as const }])
  if (existing.direction === "asc") return rest.concat([{ field, direction: "desc" as const }])
  return rest
}

// ── Filter column → default operator ────────────────────────────

export function defaultOperatorForField(field: FilterField): FilterOperator {
  switch (field) {
    case 'name':
    case 'wbs':
    case 'resources':
    case 'predecessors':
      return 'contains'
    case 'milestone':
    case 'critical':
    case 'summary':
      return 'equals'
    default:
      return 'gte'
  }
}

/** All filterable fields for the dropdown. */
export const FILTERABLE_FIELDS: { id: FilterField; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'wbs', label: 'WBS' },
  { id: 'duration', label: 'Duration (h)' },
  { id: 'percent', label: '% Complete' },
  { id: 'start', label: 'Start' },
  { id: 'finish', label: 'Finish' },
  { id: 'cost', label: 'Cost' },
  { id: 'resources', label: 'Resource Names' },
  { id: 'predecessors', label: 'Predecessors' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'critical', label: 'Critical' },
  { id: 'summary', label: 'Summary' },
  { id: 'outlineLevel', label: 'Outline Level' },
]

/** Group-by options. */
export const GROUP_BY_OPTIONS: { id: GroupByField; label: string }[] = [
  { id: 'none', label: 'No grouping' },
  { id: 'status', label: 'Status' },
  { id: 'resource', label: 'Resource' },
  { id: 'outlineLevel', label: 'Outline Level' },
]
