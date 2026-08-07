import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { formatPredecessors } from '../../application/services/PredecessorNotation'
import { formatTaskResourceNames } from '../../application/use-cases/ResourceUseCases'
import type { Project } from '../../domain/entities/Project'
import type { Task } from '../../domain/entities/Task'
import { useArrowRowNavigation } from '../hooks/useArrowRowNavigation'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import type { WorkspaceAction } from '../state/workspace'
import {
  TASK_SHEET_LABELS,
  type TaskColumnId,
} from '../taskColumns/taskColumnDefs'
import { TaskColumnsDialog } from '../taskColumns/TaskColumnsDialog'
import { useTaskColumns } from '../taskColumns/taskColumnStore'
import { fromDateInputValue, toDateInputValue } from '../utils/dateInput'
import {
  FilterBar,
} from './FilterBar'
import {
  DEFAULT_FILTER_STATE,
  deriveTaskView,
  flattenForRendering,
  toggleSort,
  type FilterField,
  type FilterState,
  type TaskSheetRow,
} from '../../application/services/TaskFilterService'
import styles from './DataTable.module.css'
import { IconAction } from './IconAction'
import { ColumnHeader, useResizableColumns } from './useResizableColumns'
import { ViewHeader } from './ViewHeader'

export function TaskSheetView() {
  const { project, selectedTaskId, selectedTaskIds } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const { columns } = useTaskColumns()
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [draftPreds, setDraftPreds] = useState<Record<string, string>>({})
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE)
  const { tableRef, colgroup, onResizeStart, onResizeAuto } = useResizableColumns(
    `${project.tasks.length}:${columns.join(',')}`,
  )

  const view = deriveTaskView(project, filterState)
  const rows: TaskSheetRow[] = flattenForRendering(view)

  useArrowRowNavigation({
    ids: rows.filter((r) => r.type === 'task').map((r) => r.task.id),
    selectedId: selectedTaskId,
    onSelect: (taskId) => dispatch({ type: 'selectTask', taskId }),
  })

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const task of project.tasks) {
      next[task.id] = formatPredecessors(project, task.id)
    }
    setDraftPreds(next)
  }, [project])

  return (
    <div className={styles.panel}>
      <ViewHeader
        title="Task Sheet"
        trailing={
          <IconAction
            icon="columns"
            label="Task columns"
            title="Configure task columns"
            onClick={() => setColumnsOpen(true)}
          />
        }
      />
      <FilterBar state={filterState} onChange={setFilterState} />
      <div className={styles.tableWrap}>
        <table ref={tableRef} className={styles.table}>
          {colgroup}
          <thead>
            <tr>
              {columns.map((id, i) => (
                <ColumnHeader
                  key={id}
                  index={i}
                  onResizeStart={onResizeStart}
                  onResizeAuto={onResizeAuto}
                  sortable
                  onClick={() =>
                    setFilterState((prev) => ({
                      ...prev,
                      sorts: toggleSort(prev.sorts, id as FilterField, false),
                    }))
                  }
                >
                  {TASK_SHEET_LABELS[id]}
                  {filterState.sorts.some((s) => s.field === id)
                    ? filterState.sorts.find((s) => s.field === id)!
                        .direction === 'asc'
                      ? ' ↑'
                      : ' ↓'
                    : ''}
                </ColumnHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              if (row.type === 'group') {
                const isCollapsed = filterState.collapsedGroups.includes(row.group.key)
                return (
                  <tr
                    key={`group-${row.group.key}`}
                    className={styles.groupRow}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      setFilterState((prev) => {
                        const collapsed = prev.collapsedGroups
                        const next = isCollapsed
                          ? collapsed.filter((k) => k !== row.group.key)
                          : [...collapsed, row.group.key]
                        return { ...prev, collapsedGroups: next }
                      })
                    }
                  >
                    <td colSpan={columns.length}>
                      {isCollapsed ? '▸' : '▾'} {row.group.label} ({row.group.taskIds.length} tasks)
                    </td>
                  </tr>
                )
              }
              const task = row.task
              const multiSelected = selectedTaskIds.includes(task.id)
              return (
                <tr
                  key={task.id}
                  data-row-id={task.id}
                  tabIndex={0}
                  className={
                    multiSelected || selectedTaskId === task.id
                      ? styles.selected
                      : undefined
                  }
                  onClick={(e) => {
                    dispatch({
                      type: 'selectTask',
                      taskId: task.id,
                      additive: e.ctrlKey || e.metaKey || e.shiftKey,
                    })
                    e.currentTarget.focus()
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Delete') return
                    const target = e.target as HTMLElement
                    if (target.closest('input, textarea, select, button')) return
                    e.preventDefault()
                    dispatch({ type: 'deleteSelection' })
                  }}
                  onDoubleClick={() =>
                    dispatch({ type: 'openTaskInfo', taskId: task.id })
                  }
                >
                  {columns.map((col) => (
                    <td key={col}>
                      {renderTaskSheetCell({
                        col,
                        task,
                        index,
                        project,
                        draftPreds,
                        setDraftPreds,
                        dispatch,
                      })}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <TaskColumnsDialog open={columnsOpen} onClose={() => setColumnsOpen(false)} />
    </div>
  )
}

function renderTaskSheetCell(opts: {
  col: TaskColumnId
  task: Task
  index: number
  project: Project
  draftPreds: Record<string, string>
  setDraftPreds: Dispatch<SetStateAction<Record<string, string>>>
  dispatch: Dispatch<WorkspaceAction>
}): ReactNode {
  const { col, task, index, project, draftPreds, setDraftPreds, dispatch } = opts

  switch (col) {
    case 'id':
      return index + 1
    case 'wbs':
      return task.wbs
    case 'name':
      return (
        <input
          style={{ paddingLeft: `calc(${task.outlineLevel} * var(--msp-indent))` }}
          value={task.name}
          aria-label={`Task ${task.wbs} name`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            dispatch({
              type: 'updateTask',
              taskId: task.id,
              patch: { name: e.target.value },
            })
          }
        />
      )
    case 'duration':
      return (
        <input
          type="number"
          min={0}
          step={0.5}
          value={task.duration.toHours()}
          disabled={task.summary}
          aria-label={`Task ${task.wbs} duration hours`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            dispatch({
              type: 'updateTask',
              taskId: task.id,
              patch: { durationHours: Number(e.target.value) },
            })
          }
        />
      )
    case 'percent':
      return (
        <input
          type="number"
          min={0}
          max={100}
          value={task.percentComplete}
          disabled={task.summary}
          aria-label={`Task ${task.wbs} percent complete`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            dispatch({
              type: 'updateTask',
              taskId: task.id,
              patch: { percentComplete: Number(e.target.value) },
            })
          }
        />
      )
    case 'start':
      return (
        <input
          type="date"
          value={toDateInputValue(task.start)}
          disabled={task.summary}
          aria-label={`Task ${task.wbs} start date`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (!e.target.value) return
            dispatch({
              type: 'updateTask',
              taskId: task.id,
              patch: { start: fromDateInputValue(e.target.value) },
            })
          }}
        />
      )
    case 'finish':
      return (
        <input
          type="date"
          value={toDateInputValue(task.finish)}
          disabled={task.summary}
          aria-label={`Task ${task.wbs} finish date`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (!e.target.value) return
            dispatch({
              type: 'updateTask',
              taskId: task.id,
              patch: { finish: fromDateInputValue(e.target.value) },
            })
          }}
        />
      )
    case 'cost':
      return task.cost.format()
    case 'resources':
      return (
        <button
          type="button"
          className={styles.resourceCell}
          disabled={task.summary}
          title="Click to assign resources"
          aria-label={`Task ${task.wbs} resources`}
          onClick={(e) => {
            e.stopPropagation()
            dispatch({
              type: 'openAssignDialog',
              taskId: task.id,
            })
          }}
        >
          {formatTaskResourceNames(project, task.id)}
        </button>
      )
    case 'predecessors':
      return (
        <input
          value={draftPreds[task.id] ?? ''}
          disabled={task.summary}
          placeholder="e.g. 2FS+8h"
          aria-label={`Task ${task.wbs} predecessors`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setDraftPreds((prev) => ({
              ...prev,
              [task.id]: e.target.value,
            }))
          }
          onBlur={() => {
            const notation = draftPreds[task.id] ?? ''
            const current = formatPredecessors(project, task.id)
            if (notation.trim() === current.trim()) return
            dispatch({
              type: 'setPredecessors',
              taskId: task.id,
              notation,
            })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      )
    default:
      return null
  }
}
