import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { toResourceSheet } from '../../application/services/ReportingService'
import styles from './DataTable.module.css'

export function ResourceView() {
  const { project, selectedResourceId, selectedTaskId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const utilization = toResourceSheet(project)

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h2>Resources</h2>
        <p>
          Select a task in Gantt/Task Sheet, then use Assign here — or use toolbar{' '}
          <strong>Assign</strong> / Task Info → Resources from any view.
        </p>
        <button type="button" onClick={() => dispatch({ type: 'addResource' })}>
          Add Resource
        </button>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Group</th>
              <th>Max Units</th>
              <th>Std Rate</th>
              <th>Assigned</th>
              <th>Work (h)</th>
              <th>Cost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {project.resources.map((resource) => {
              const util = utilization.find((u) => u.resourceId === resource.id)
              return (
                <tr
                  key={resource.id}
                  className={[
                    selectedResourceId === resource.id ? styles.selected : '',
                    util?.overallocated ? styles.danger : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() =>
                    dispatch({ type: 'selectResource', resourceId: resource.id })
                  }
                >
                  <td>
                    <input
                      value={resource.name}
                      aria-label="Resource name"
                      onChange={(e) =>
                        dispatch({
                          type: 'updateResource',
                          resourceId: resource.id,
                          patch: { name: e.target.value },
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={resource.type}
                      aria-label="Resource type"
                      onChange={(e) =>
                        dispatch({
                          type: 'updateResource',
                          resourceId: resource.id,
                          patch: {
                            type: e.target.value as 'work' | 'material' | 'cost',
                          },
                        })
                      }
                    >
                      <option value="work">Work</option>
                      <option value="material">Material</option>
                      <option value="cost">Cost</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={resource.group}
                      aria-label="Resource group"
                      onChange={(e) =>
                        dispatch({
                          type: 'updateResource',
                          resourceId: resource.id,
                          patch: { group: e.target.value },
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={resource.maxUnits}
                      aria-label="Max units"
                      onChange={(e) =>
                        dispatch({
                          type: 'updateResource',
                          resourceId: resource.id,
                          patch: { maxUnits: Number(e.target.value) },
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={resource.standardRate.amount}
                      aria-label="Standard rate"
                      onChange={(e) =>
                        dispatch({
                          type: 'updateResource',
                          resourceId: resource.id,
                          patch: { standardRate: Number(e.target.value) },
                        })
                      }
                    />
                  </td>
                  <td>{util?.assignedUnits.toFixed(1) ?? '0'}</td>
                  <td>{util?.workHours.toFixed(1) ?? '0'}</td>
                  <td>{util?.cost.format() ?? '—'}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        disabled={!selectedTaskId}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!selectedTaskId) return
                          dispatch({
                            type: 'assignResource',
                            taskId: selectedTaskId,
                            resourceId: resource.id,
                          })
                        }}
                      >
                        Assign to task
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          dispatch({ type: 'deleteResource', resourceId: resource.id })
                        }}
                      >
                        Delete
                      </button>
                    </div>
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
