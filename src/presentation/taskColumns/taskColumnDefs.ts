/** Shared task-table column catalog for Gantt grid + Task Sheet. */

export const TASK_COLUMN_IDS = [
  'id',
  'wbs',
  'name',
  'duration',
  'percent',
  'start',
  'finish',
  'totalSlack',
  'freeSlack',
  'cost',
  'resources',
  'predecessors',
  'milestone',
  'critical',
  'summary',
] as const

export type TaskColumnId = (typeof TASK_COLUMN_IDS)[number]

export type TaskColumnDef = {
  id: TaskColumnId
  label: string
  /** Default Gantt grid width (px). */
  ganttWidth: number
  ganttMinWidth: number
  /** Tree expander column (Task name). */
  tree?: boolean
  align?: 'left' | 'center' | 'right'
}

export const TASK_COLUMN_DEFS: Record<TaskColumnId, TaskColumnDef> = {
  id: {
    id: 'id',
    label: 'ID',
    ganttWidth: 48,
    ganttMinWidth: 40,
    align: 'center',
  },
  wbs: {
    id: 'wbs',
    label: 'WBS',
    ganttWidth: 72,
    ganttMinWidth: 48,
  },
  name: {
    id: 'name',
    label: 'Task name',
    ganttWidth: 220,
    ganttMinWidth: 120,
    tree: true,
  },
  duration: {
    id: 'duration',
    label: 'Hours',
    ganttWidth: 64,
    ganttMinWidth: 48,
    align: 'center',
  },
  percent: {
    id: 'percent',
    label: '%',
    ganttWidth: 52,
    ganttMinWidth: 40,
    align: 'center',
  },
  start: {
    id: 'start',
    label: 'Start',
    ganttWidth: 110,
    ganttMinWidth: 90,
    align: 'center',
  },
  finish: {
    id: 'finish',
    label: 'Finish',
    ganttWidth: 110,
    ganttMinWidth: 90,
    align: 'center',
  },
  totalSlack: {
    id: 'totalSlack',
    label: 'Total Slack',
    ganttWidth: 72,
    ganttMinWidth: 56,
    align: 'center',
  },
  freeSlack: {
    id: 'freeSlack',
    label: 'Free Slack',
    ganttWidth: 72,
    ganttMinWidth: 56,
    align: 'center',
  },
  cost: {
    id: 'cost',
    label: 'Cost',
    ganttWidth: 88,
    ganttMinWidth: 64,
    align: 'right',
  },
  resources: {
    id: 'resources',
    label: 'Resources',
    ganttWidth: 140,
    ganttMinWidth: 80,
  },
  predecessors: {
    id: 'predecessors',
    label: 'Predecessors',
    ganttWidth: 120,
    ganttMinWidth: 72,
  },
  milestone: {
    id: 'milestone',
    label: 'Milestone',
    ganttWidth: 72,
    ganttMinWidth: 56,
    align: 'center',
  },
  critical: {
    id: 'critical',
    label: 'Critical',
    ganttWidth: 64,
    ganttMinWidth: 48,
    align: 'center',
  },
  summary: {
    id: 'summary',
    label: 'Summary',
    ganttWidth: 64,
    ganttMinWidth: 48,
    align: 'center',
  },
}

/** Sheet header labels (Duration (h) etc.). */
export const TASK_SHEET_LABELS: Record<TaskColumnId, string> = {
  id: 'ID',
  wbs: 'WBS',
  name: 'Name',
  duration: 'Duration (h)',
  percent: '%',
  start: 'Start',
  finish: 'Finish',
  totalSlack: 'Total Slack',
  freeSlack: 'Free Slack',
  cost: 'Cost',
  resources: 'Resource Names',
  predecessors: 'Predecessors',
  milestone: 'Milestone',
  critical: 'Critical',
  summary: 'Summary',
}

/**
 * Default visible set + order (Task Sheet parity + Predecessors on Gantt).
 * `name` is always forced visible by the normalizer.
 */
export const DEFAULT_TASK_COLUMNS: readonly TaskColumnId[] = [
  'id',
  'wbs',
  'name',
  'duration',
  'percent',
  'start',
  'finish',
  'cost',
  'resources',
  'predecessors',
]

export function isTaskColumnId(value: unknown): value is TaskColumnId {
  return (
    typeof value === 'string' &&
    (TASK_COLUMN_IDS as readonly string[]).includes(value)
  )
}

/** Dedupe, drop unknowns, ensure `name` is present. */
export function normalizeTaskColumns(
  ids: readonly string[] | null | undefined,
): TaskColumnId[] {
  const seen = new Set<TaskColumnId>()
  const out: TaskColumnId[] = []
  for (const raw of ids ?? []) {
    if (!isTaskColumnId(raw) || seen.has(raw)) continue
    seen.add(raw)
    out.push(raw)
  }
  if (out.length === 0) return [...DEFAULT_TASK_COLUMNS]
  if (!seen.has('name')) {
    const insertAt = Math.min(2, out.length)
    out.splice(insertAt, 0, 'name')
  }
  return out
}
