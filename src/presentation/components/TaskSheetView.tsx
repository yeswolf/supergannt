import { useEffect, useState } from 'react'
import { formatPredecessors } from '../../application/services/PredecessorNotation'
import { formatTaskResourceNames } from '../../application/use-cases/ResourceUseCases'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { fromDateInputValue, toDateInputValue } from '../utils/dateInput'
import styles from './DataTable.module.css'
import { ColumnHeader, useResizableColumns } from './useResizableColumns'
import { ViewHeader } from './ViewHeader'

const HEADERS = [
  'ID',
  'WBS',
  'Name',
  'Duration (h)',
  '%',
  'Start',
  'Finish',
  'Cost',
  'Resource Names',
  'Predecessors',
] as const

export function TaskSheetView() {
  const { project, selectedTaskId, selectedTaskIds } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const [draftPreds, setDraftPreds] = useState<Record<string, string>>({})
  const { tableRef, colgroup, onResizeStart, onResizeAuto } = useResizableColumns(
    project.tasks.length,
  )

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const task of project.tasks) {
      next[task.id] = formatPredecessors(project, task.id)
    }
    setDraftPreds(next)
  }, [project])

  return (
    <div className={styles.panel}>
      <ViewHeader title="Task Sheet" />
      <div className={styles.tableWrap}>
        <table ref={tableRef} className={styles.table}>
          {colgroup}
          <thead>
            <tr>
              {HEADERS.map((label, i) => (
                <ColumnHeader
                  key={label}
                  index={i}
                  onResizeStart={onResizeStart}
                  onResizeAuto={onResizeAuto}
                >
                  {label}
                </ColumnHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {project.tasks.map((task, index) => {
              const multiSelected = selectedTaskIds.includes(task.id)
              return (
                <tr
                  key={task.id}
                  className={
                    multiSelected || selectedTaskId === task.id
                      ? styles.selected
                      : undefined
                  }
                  onClick={(e) =>
                    dispatch({
                      type: 'selectTask',
                      taskId: task.id,
                      additive: e.ctrlKey || e.metaKey || e.shiftKey,
                    })
                  }
                  onDoubleClick={() =>
                    dispatch({ type: 'openTaskInfo', taskId: task.id })
                  }
                >
                  <td>{index + 1}</td>
                  <td>{task.wbs}</td>
                  <td>
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
                  </td>
                  <td>
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
                  </td>
                  <td>
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
                  </td>
                  <td>
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
                  </td>
                  <td>
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
                  </td>
                  <td>{task.cost.format()}</td>
                  <td>
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
                  </td>
                  <td>
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
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
