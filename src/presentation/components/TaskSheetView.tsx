import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import {
  applyTaskFilterSort,
  getGroupKey,
  type TaskGroupField,
  type TaskViewRow,
} from '../../application/services/TaskFilterSortService'
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
import { formatSlackHours } from '../common/formatSlack'
import styles from './DataTable.module.css'
import fStyles from './FilterBar.module.css'
import { IconAction } from './IconAction'
import { ColumnHeader, useResizableColumns } from './useResizableColumns'
import { ViewHeader } from './ViewHeader'
import { FilterBar } from './FilterBar'

export function TaskSheetView() {
  const { project, selectedTaskId, selectedTaskIds, taskFilterSort } =
    useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const { columns } = useTaskColumns()
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [draftPreds, setDraftPreds] = useState<Record<string, string>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  )

  const rows: TaskViewRow[] = useMemo(
    () => applyTaskFilterSort(project, taskFilterSort),
    [project, taskFilterSort],
  )

  const taskIds = useMemo(
    () =>
      rows
        .filter((r): r is { type: 'task'; task: Task } => r.type === 'task')
        .map((r) => r.task.id),
    [rows],
  )

  const { tableRef, colgroup, onResizeStart, onResizeAuto } =
    useResizableColumns(`${project.tasks.length}:${columns.join(',')}`)

  useArrowRowNavigation({
    ids: taskIds,
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

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
      <FilterBar
        state={taskFilterSort}
        onSetFilter={(f) => dispatch({ type: 'setTaskFilter', filter: f })}
        onRemoveFilter={(id) => dispatch({ type: 'removeTaskFilter', filterId: id })}
        onClearFilters={() => dispatch({ type: 'clearTaskFilters' })}
        onSetSort={(s) => dispatch({ type: 'setTaskSort', sort: s })}
        onSetGroup={(g) => dispatch({ type: 'setTaskGroup', groupBy: g })}
      />
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
                >
                  {TASK_SHEET_LABELS[id]}
                </ColumnHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              if (row.type === 'groupHeader') {
                const collapsed = collapsedGroups.has(row.groupKey)
                return (
                  <tr
                    key={`gh-${row.groupKey}`}
                    className={fStyles.groupHeader}
                    onClick={() => toggleGroup(row.groupKey)}
                  >
                    <td colSpan={columns.length}>
                      <span className={fStyles.groupToggle}>
                        {collapsed ? '▸' : '▾'}
                      </span>
                      {row.groupLabel}
                      <span className={fStyles.groupSummary}>
                        ({row.taskCount} tasks, {row.cost}, {row.workHours}h)
                      </span>
                    </td>
                  </tr>
                )
              }
              // Skip collapsed group tasks
              if (
                taskFilterSort.groupBy !== 'none' &&
                isTaskInCollapsedGroup(
                  project,
                  row.task,
                  taskFilterSort.groupBy,
                  collapsedGroups,
                )
              ) {
                return null
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

function isTaskInCollapsedGroup(
  project: Project,
  task: Task,
  groupBy: string,
  collapsedGroups: Set<string>,
): boolean {
  if (groupBy === 'none') return false
  const key = getGroupKey(project, task, groupBy as TaskGroupField)
  return collapsedGroups.has(key)
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
    case 'totalSlack':
      return formatSlackHours(task.totalSlackHours)
    case 'freeSlack':
      return formatSlackHours(task.freeSlackHours)
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
