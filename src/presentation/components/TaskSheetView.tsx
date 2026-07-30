import { useEffect, useState } from 'react'
import { formatPredecessors } from '../../application/services/PredecessorNotation'
import { formatTaskResourceNames } from '../../application/use-cases/ResourceUseCases'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { fromDateInputValue, toDateInputValue } from '../utils/dateInput'
import styles from './DataTable.module.css'

export function TaskSheetView() {
  const { project, selectedTaskId, selectedTaskIds } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const [draftPreds, setDraftPreds] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const task of project.tasks) {
      next[task.id] = formatPredecessors(project, task.id)
    }
    setDraftPreds(next)
  }, [project])

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h2>Task Sheet</h2>
        <p>
          Assign people via the Resources column or Assign. Predecessors:{' '}
          <code>2FS+8h</code>. Ctrl/Cmd+click to multi-select, then Link.
        </p>
        <div className={styles.rowActions}>
          <button
            type="button"
            disabled={!selectedTaskId}
            onClick={() => dispatch({ type: 'openAssignDialog' })}
          >
            Assign Resources…
          </button>
          <button
            type="button"
            disabled={!selectedTaskId}
            onClick={() =>
              dispatch({ type: 'openTaskInfo', tab: 'resources' })
            }
          >
            Task Information…
          </button>
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>WBS</th>
              <th>Name</th>
              <th>Duration (h)</th>
              <th>%</th>
              <th>Start</th>
              <th>Finish</th>
              <th>Cost</th>
              <th>Resource Names</th>
              <th>Predecessors</th>
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
                      style={{ paddingLeft: `${task.outlineLevel * 1.1}rem` }}
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
