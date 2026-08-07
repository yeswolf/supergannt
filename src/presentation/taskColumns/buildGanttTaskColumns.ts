import {
  TASK_COLUMN_DEFS,
  type TaskColumnId,
} from './taskColumnDefs'

export type GanttGridColumn = {
  name: string
  label: string
  tree?: boolean
  width: number
  min_width: number
  resize: boolean
  align?: 'left' | 'center' | 'right'
  template?: (task: Record<string, unknown>) => string
  editor?: { type: string; map_to: string }
}

const GANTT_NAME: Record<TaskColumnId, string> = {
  id: 'row',
  wbs: 'wbs',
  name: 'text',
  duration: 'duration',
  percent: 'percent',
  start: 'start_date',
  finish: 'end_date',
  totalSlack: 'totalSlack',
  freeSlack: 'freeSlack',
  cost: 'cost',
  resources: 'resources',
  predecessors: 'predecessors',
}

/**
 * Map shared task-column prefs to dhtmlx `config.columns`.
 * Compact (narrow/Android) callers should pass `['name']` only.
 */
export function buildGanttTaskColumns(
  visible: readonly TaskColumnId[],
): { columns: GanttGridColumn[]; gridWidth: number } {
  const columns: GanttGridColumn[] = []
  let gridWidth = 0

  for (const id of visible) {
    const def = TASK_COLUMN_DEFS[id]
    const name = GANTT_NAME[id]
    const col: GanttGridColumn = {
      name,
      label: def.label,
      width: def.ganttWidth,
      min_width: def.ganttMinWidth,
      resize: true,
    }
    if (def.tree) col.tree = true
    if (def.align) col.align = def.align

    if (id === 'id') {
      col.template = (task) => String(task.row ?? '')
    } else if (id === 'resources') {
      col.template = (task) => String(task.resources ?? '').trim()
    } else if (id === 'percent') {
      col.template = (task) => {
        if (typeof task.percent === 'number') return String(task.percent)
        const p = Number(task.progress)
        return Number.isFinite(p) ? String(Math.round(p * 100)) : ''
      }
    } else if (id === 'cost') {
      col.template = (task) => String(task.cost ?? '')
    } else if (id === 'predecessors') {
      col.template = (task) => String(task.predecessors ?? '')
      col.editor = { type: 'text', map_to: 'predecessors' }
    } else if (id === 'totalSlack') {
      col.template = (task) => String(task.totalSlack ?? '')
    } else if (id === 'freeSlack') {
      col.template = (task) => String(task.freeSlack ?? '')
    } else if (id === 'finish') {
      // Built-in end_date column formats via dhtmlx; keep name mapping.
    }

    columns.push(col)
    gridWidth += def.ganttWidth
  }

  return { columns, gridWidth: Math.max(gridWidth, 120) }
}
